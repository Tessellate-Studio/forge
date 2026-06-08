# New-app brief

Fill this in (a paragraph each is plenty) and hand it to `/new-app`. Anything you
leave blank, the skill asks about before scaffolding — it never guesses a name,
package id, or platform.

## Required

- **App name:** <kebab-or-word, becomes the repo name>
- **One-line purpose:** <what it does, for whom>
- **Platform / stack:** <e.g. React Native + Expo mobile; or Next.js web; or Node
  service>. If RN+Expo, the skill wires the mobile defaults.
- **Package / bundle id:** <e.g. com.tessellate.theapp> (mobile only)
- **Visibility:** <private | public>

## Optional (sensible defaults if blank)

- **Backend:** <Supabase | Vercel functions | none>
- **First screens / surfaces:** <the 1–3 things a user sees first>
- **Domain anti-patterns to seed:** <anything app-specific you already know NOT to
  build — goes into memory/, separate from the shared set>
- **External setups expected:** <DNS, OAuth, email, payments — tracked in
  docs/user-actions-tracker.md as they're decided>

## What the skill does NOT need

Don't pre-write a backlog or feature list — roadmap-pulse builds that later. The
brief is for *standing up the repo*, not planning the product.
