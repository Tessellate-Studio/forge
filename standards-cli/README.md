# Code Standards SDK

Automated best-practices enforcement for Tessellate projects — project scaffolding, code validation, and audit reports.

> Repo: `git@github.com:Tessellate-Studio/code-standards.git` (formerly `ramsaptami/code-directives` — old paths redirect).

## Install

```bash
npm install -g github:Tessellate-Studio/code-standards
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
    uses: Tessellate-Studio/code-standards/.github/workflows/code-inspection.yml@main
    with:
      fail_on_error: false   # advisory; flip to true once tuned
```

## Notes

- Generated projects import the SDKs as npm dependencies — no copied source, no duplicated logic.
- Pairs with [`@tessellate-studio/rubric-sdk`](https://github.com/Tessellate-Studio/rubric-sdk) for task scoring and prioritization.
- Per-project config lives in `.bp-config.yml`.

Full usage and API: [docs/](docs/).
