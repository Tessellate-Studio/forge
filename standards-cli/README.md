# Code Standards SDK

Automated best-practices enforcement for Tessellate projects — project scaffolding, code validation, and audit reports.

> Part of the **forge** platform repo (`Tessellate-Studio/forge`,
> `standards-cli/` subdir) since 2026-07-17 — formerly the separate
> `code-standards` repo (and `ramsaptami/code-directives` before that).

## Install

```bash
npm install -g github:Tessellate-Studio/forge   # gives `standards` + `bp` (+ rubric)
```

## Commands

```bash
standards init my-app --template react-native   # scaffold a new project
standards inspect --fix                          # check secrets, deps, perf, a11y — auto-fix where safe
standards audit --output report.json             # generate a compliance report
```

## CI gate

Call the reusable workflow from your repo:

```yaml
jobs:
  inspect:
    uses: Tessellate-Studio/forge/.github/workflows/code-inspection.yml@master
    with:
      fail_on_error: false   # advisory; flip to true once tuned
```

## Notes

- Generated projects import the SDKs as npm dependencies — no copied source, no duplicated logic.
- Pairs with the rubric SDK (same repo, [`rubric/`](../rubric/)) for task scoring and prioritization.
- Per-project config lives in `.bp-config.yml`.

Full usage and API: [docs/](docs/).
