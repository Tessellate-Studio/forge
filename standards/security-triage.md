# Standard: dependency security triage

How every Tessellate app triages `npm audit` / Dependabot alerts. Generalized
from badige's `docs/SECURITY.md`. OWASP is non-negotiable — this is the process
that keeps the "fixed" claim honest (pairs with the authoritative-claims standard:
don't claim "fixed" what isn't).

Each app keeps its OWN dated **disposition log** (`docs/SECURITY.md`) recording
which alerts are fixed vs accepted-residual and why. This file is the shared
*policy*; the app file is the *current state*.

## Triage policy

1. **Run the safe pass first.** `npm audit fix` (semver-compatible, no `--force`)
   — moves transitive lockfile entries only, never bumps a direct dependency.
2. **Never `npm audit fix --force` blindly.** On a React Native app it can bump
   `react-native` to a new major and break the native build — a deliberate
   migration, not a security-patch task.
3. **Distinguish app-runtime from build-time.** A vuln in a package that ships in
   the app binary (anything under `dependencies` reached at runtime) is
   prioritised. A vuln in dev/build CLI tooling (`@react-native-community/cli-*`,
   jest, eslint, detox, babel build plugins) runs only on a dev machine — lower
   urgency.
4. **Verify after every fix:** the unit suite must stay green (it exercises many
   bumped transitive deps).

## Accepting a residual

A vuln may be accepted (logged, not fixed) only when ALL hold: build-time-only
(not in the shipped binary), AND no patched version exists OR the only fix is a
breaking major on a code path the app never invokes. Record the package, severity,
and the one-line reason in the app's `docs/SECURITY.md`. A real remediation that
requires a framework upgrade is its own tracked task (rubric-scored), not a
Dependabot quick-fix.

## Re-check commands

```
npm audit
gh api repos/<owner>/<repo>/dependabot/alerts --paginate \
  -q '.[] | select(.state=="open") | [.security_advisory.severity, .dependency.package.name] | @tsv'
```
