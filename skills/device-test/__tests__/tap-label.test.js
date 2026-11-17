const {
  parseNodes,
  choose,
  centerOf,
  isDestructive,
} = require('../scripts/tap-label');

// A trimmed uiautomator dump: the open Tjori card with the "Profile changed" banner showing, which
// pushed the action row down (2026-11-17: a tap at the pre-banner coordinates landed on "Bought it").
const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node text="" content-desc="Profile changed since this check · Re-check" clickable="true" bounds="[63,2002][1377,2155]" />
  <node text="" content-desc="Re-check" clickable="true" bounds="[168,2530][288,2650]" />
  <node text="Store" content-desc="" clickable="true" bounds="[310,2530][580,2650]" />
  <node text="Bought it" content-desc="" clickable="true" bounds="[604,2530][960,2650]" />
  <node text="Notify" content-desc="" clickable="true" bounds="[985,2530][1270,2650]" />
  <node text="Data from tjori.com · checked 3m ago" content-desc="" clickable="false" bounds="[350,2700][1090,2760]" />
</hierarchy>`;

describe('parseNodes', () => {
  it('reads text, content-desc and bounds, so a button is found by what it says, not where it was', () => {
    const nodes = parseNodes(XML);
    expect(nodes).toHaveLength(6);
    expect(nodes[3]).toMatchObject({
      text: 'Bought it',
      bounds: [604, 2530, 960, 2650],
      clickable: true,
    });
    expect(nodes[1]).toMatchObject({ desc: 'Re-check' });
  });

  it('decodes the entities uiautomator writes', () => {
    const [n] = parseNodes(
      `<node text="Fit &amp; note &quot;x&quot;" content-desc="" bounds="[0,0][10,10]" />`
    );
    expect(n.text).toBe('Fit & note "x"');
  });
});

describe('choose', () => {
  const nodes = parseNodes(XML);

  it('finds the exact label in text or content-desc and taps its centre', () => {
    const hit = choose(nodes, 'Re-check');
    expect(centerOf(hit.bounds)).toEqual([228, 2590]);

    // the longer banner also contains "Re-check": exact match must not pick it
    expect(hit.desc).toBe('Re-check');
  });

  it('refuses a label that is not on screen, naming what is', () => {
    expect(() => choose(nodes, 'Delete')).toThrow(
      /not on screen.*Re-check.*Bought it/s
    );
  });

  it('refuses two matches instead of guessing which one', () => {
    const two = parseNodes(
      `<node text="Done" content-desc="" bounds="[0,0][10,10]" /><node text="Done" content-desc="" bounds="[0,20][10,30]" />`
    );
    expect(() => choose(two, 'Done')).toThrow(/2 matches/);
    expect(choose(two, 'Done', { index: 1 }).bounds).toEqual([0, 20, 10, 30]);
  });

  it('a pressable and the text inside it are one control: the clickable one wins, no false "2 matches"', () => {
    const rn = parseNodes(
      `<node text="" content-desc="Notify" clickable="true" bounds="[985,2530][1270,2650]" /><node text="Notify" content-desc="" clickable="false" bounds="[1000,2560][1250,2620]" />`
    );
    const hit = choose(rn, 'Notify');
    expect(hit.clickable).toBe(true);
    expect(hit.bounds).toEqual([985, 2530, 1270, 2650]);
  });

  it('a substring match is opt-in', () => {
    expect(() => choose(nodes, 'Bought')).toThrow(/not on screen/);
    expect(
      choose(nodes, 'Bought', { contains: true, allowDestructive: true }).text
    ).toBe('Bought it');
    expect(choose(nodes, 'Stor', { contains: true }).text).toBe('Store');
  });

  it('will not tap a label that changes the account unless the step says so', () => {
    expect(isDestructive('Bought it')).toBe(true);
    expect(isDestructive('Delete my profile')).toBe(true);
    expect(isDestructive('Re-check')).toBe(false);
    expect(() => choose(nodes, 'Bought it')).toThrow(/changes the account/);
    expect(choose(nodes, 'Bought it', { allowDestructive: true }).text).toBe(
      'Bought it'
    );
  });
});
