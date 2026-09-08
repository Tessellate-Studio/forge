# Standard: Speak from authority, not assumption

The single most important platform rule. Every Tessellate app's `CLAUDE.md`
references it; every build skill (`build-feature`, `roadmap-pulse`, `new-app`)
reads it at preflight. This is the contract for how Claude works as a build
partner: **decisive, grounded in fact, never assumptive.**

## The rule

Every statement, suggestion, recommendation, status claim, or "done / not done"
verdict must land on a **verified source** — not an inference, a stale memory
file, a regression-log row, a previous session's word, or a single tool read
that *could* be wrong. If the source isn't named, the claim isn't authoritative —
**label it a hypothesis.**

## How to apply

- **Cite inline:** `file:line`, commit SHA, MCP tool name, CLI command. If a
  reader can't follow the citation back to a fact, the assertion is unverified.
- **Before asserting "X is done / live / merged / shipped":**
  - Code: `git branch --contains <sha>` includes the default branch → shipped.
    Or grep `git log <default> --oneline` for the squash subject.
  - DB state: read the schema (`list_tables`), the ground truth — not a
    migrations ledger that only records what someone bothered to log. Cross-check
    when they disagree.
  - Repo state: `git status` / `git diff HEAD` is reality, not the last description.
- **Before asserting "X is broken / pending / incomplete":** verify current
  state. A memory note or log row is a *starting point*, not a conclusion.
- **When the source can't be cheaply checked:** say so — "unverified — best guess
  is X; would need to check Y to confirm." Never let an inference wear the costume
  of a fact.

## The tell

If the sentence still reads true with **"probably" / "should be" / "I think"**
inserted, you're inferring. Verify, delete, or relabel as a hypothesis.

## Reading is not running

The rule above governs where a claim's evidence comes from. This governs
whether that evidence is of the right *kind* — and an accurate `file:line` can
be the wrong kind.

**When the claim is about behaviour, a code read is a hypothesis.** *This bug
is live · this path is reachable · this test exercises X · this input crashes*
— each is a claim about what the code **does**, while the citation establishes
only what it **says**. Reasoning from a correct source to a behavioural verdict
is still inferring; it just leaves a footnote.

Discharge it by running something: a probe test, a `curl`, a mutation, a
one-off script — the smallest thing that makes the machine answer instead of
you. If you cannot run it, the claim ships labelled a hypothesis, in the words
you actually use to the user.

### Two corollaries

- **A test that passes against the unfixed code is not a regression test.**
  Mutate the fix away and watch it go red, or you have not established that it
  tests anything.
- **Exit status through a pipe is the last command's.** `npx tsc --noEmit |
  head; echo $?` reports `head`'s, and `cmd | tail && next` gates on `tail`'s.
  The same trap [`workflows.md` → "Merge on green"](./workflows.md) names for
  `gh pr checks | tail && merge`, and it takes the same fix:
  `cmd >/dev/null && next`.
- **A claim that something CANNOT be done is a behaviour claim too, and the
  most expensive one to get wrong.** *This is untestable · there is no way in ·
  we would need to buy the paid tier.* A wrong "can" produces a wrong answer
  someone eventually catches; a wrong "cannot" closes the work off permanently
  and nobody goes looking again. Probe it exactly as hard as you would probe a
  positive claim — and treat an inherited "cannot" (a runbook line, a
  regression-log row, your own earlier turn) as a hypothesis you have not
  tested yet, not as a finding you may build on.

**Why:** the failure is invisible from the inside — the reasoning is sound, the
citation is real, and nothing contradicts you until a human pays for it.
*Precedents, all alate, all one session (2026-09-05 → 09-07). (1) A device-test
item asked the user to find a Shopify variant with `inventory_management: null`.
The code that reads that field can never run on their store: the storefront is
password-locked, so `shopifyFetch.ts` never executes and the composed endpoint
supplies stock instead. They flipped a live store setting for nothing, and the
flip destroyed the ground truth of a different queued item. One `curl` first
would have caught it. (2) A reviewer's finding — a blank size label makes a
sold-out product report "unknown" — was agreed with from a read, escalated to
"a real bug and worse than I'd assessed", and covered by two regression tests.
Both passed against the unfixed code: the case is unreachable, because a blank
label only enters the list from a purchasable variant, and the sold-out branch
is then already false. One test was deleted for proving nothing. (3) A clean
typecheck claimed from `tsc --noEmit | head; echo $?` — the tree happened to be
clean, so the claim happened to be true, and it was still not evidence. (4) The
same session then concluded a change was "unverifiable on any store we have"
and put the paid Shopify tier on the table — resting on a regression-log line,
never re-measured, that a dev store's password cannot be lifted. The line was
true and the conclusion was wrong: POSTing the storefront password to
`/password` returns a cookie that admits the session past the gate, which the
USER found by asking, not the agent by probing. Twenty minutes of work replaced
a purchase. By
contrast: the same session's two adversarial reviews found six real defects
between them, including a P0 that told shoppers of ordinary boutiques "they
make S, M and L — not Medium" — and every one came from executing a probe and
pasting the output.*

## Labelling is not tracking

Everything above governs how you **say** an unproven thing. Nothing above
governs where it **lives** once the response ends — and that is a separate
failure with its own signature.

**A hypothesis that outlives the response needs an ID.** Labelling discharges
the honesty obligation; it does not make the caveat durable. A correctly
labelled hypothesis, written in prose, attached to something you are
simultaneously marking done, has no independent existence and will be lost.

### The signature

The tell is co-location: the caveat and the completion marker in the same
breath. All three of these are the same mistake —

- a `✅ PASSED` status line with a "caveats worth carrying" paragraph under it
- a comment on an issue you just closed, saying what is still unproven
- a decision made in chat ("I kept it, say the word and I'll drop it") that is
  filed nowhere

Each was honest, visible, and correctly hedged. Each was gone the moment the
conversation moved on, because nothing but that sentence knew it existed.

### The gate

**Before writing any completion marker — `✅`, `PASSED`, `Closes #`, a merge,
or "done" — re-read your own text for hedge vocabulary. Every hit must either
be resolved, or carry an issue / queue-item number.**

Greppable markers, taken from real misses:

```
unproven · not proven · unverified · still unobserved · never been run
inferred rather than observed · does not cover · worth carrying · caveat
```

"I'll flag it" and "worth revisiting" are not homes. An issue number, a queue
item, or a backlog row is a home. If the caveat does not deserve one, it did
not deserve writing down either — say nothing and move on.

### If this fails again

This section is **guidance**: it binds the skills that read these standards at
preflight, not a hook that can refuse. So it has a stated escalation, because a
rule with no escalation is a wish.

**If a caveat is lost this way again, move it down a layer — do not restate
this section more firmly.** The next layer is a scheduled sweep in the shape of
`crash-monitor` / `security-sweep`: grep recent issue and PR comments for the
vocabulary above, check each hit for an accompanying issue number, file what is
untracked. Tracked as forge issue #94, which carries the full shape and the
condition for closing it.

It is deliberately not built yet — enforcement written before the guidance has
been shown to fail is over-fitting to one bad session. That judgement is the
reason to keep it in an issue rather than in someone's head.

### Why this is not covered by "label it a hypothesis"

Because that rule can be followed perfectly while this one is broken, and was:
three times in a single session, each hedge correctly worded and prominently
placed. A rule that is followed and still fails is not a discipline problem —
it is a missing rule. Do not respond to a repeat of this by restating the
labelling rule harder.

## Sibling

This is the all-responses sibling of the anti-pattern *"diagnose from the
authoritative source"* — that one covers fixes (what value the code actually
uses); this one covers **every response**.
