const { emit, withDeadline, disabled } = require('../lib/session-start');

describe('emit — the SessionStart envelope', () => {
  it('nests additionalContext under hookSpecificOutput with a hookEventName', async () => {
    // The shape was got wrong once and the model never saw the output; the
    // warning about it used to be pasted into three hooks. Encoding it here is
    // what makes a fourth hook unable to repeat the mistake.
    const chunks = [];
    const write = process.stdout.write;
    process.stdout.write = (s, cb) => {
      chunks.push(s);
      if (cb) {
        cb();
      }
      return true;
    };
    try {
      await emit({ systemMessage: 'one line', context: 'the long part' });
    } finally {
      process.stdout.write = write;
    }
    const out = JSON.parse(chunks.join(''));
    expect(out.systemMessage).toBe('one line');
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toBe('the long part');
    expect(Object.keys(out)).toEqual(['systemMessage', 'hookSpecificOutput']);
  });
});

describe('withDeadline', () => {
  it('returns the value when the work finishes in time', async () => {
    expect(await withDeadline(Promise.resolve('done'), 1000)).toBe('done');
  });

  it('returns null when it does not', async () => {
    const slow = new Promise(r => setTimeout(() => r('late'), 200));
    expect(await withDeadline(slow, 10)).toBeNull();
  });
});

describe('disabled', () => {
  it('accepts the documented off-switch spellings', () => {
    ['1', 'true', 'yes', 'on', 'TRUE'].forEach(v =>
      expect(disabled(v)).toBe(true)
    );
  });

  it('treats unset, empty and anything else as enabled', () => {
    [undefined, null, '', '0', 'false', 'no'].forEach(v =>
      expect(disabled(v)).toBe(false)
    );
  });
});
