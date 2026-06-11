# M2 — Supabase setup (blocked on local tooling, everything else is ready)

The schema, RLS policies, and RLS security tests are already written:

- [supabase/migrations/0001_init.sql](../supabase/migrations/0001_init.sql) — applications + events tables, user_id on every row, RLS policies, the closed-needs-reason invariant mirrored as a check constraint
- [supabase/tests/rls.test.sql](../supabase/tests/rls.test.sql) — pgTAP: cross-user select/update/delete/insert all denied

## One-time machine setup (manual — needs your password/account)

```bash
brew install supabase/tap/supabase
# Docker Desktop (or OrbStack, lighter): https://orbstack.dev
brew install --cask orbstack
```

## Then, in this repo

```bash
supabase init            # creates supabase/config.toml (keep existing migrations/)
supabase start           # local Postgres + auth + studio
supabase db reset        # applies 0001_init.sql
supabase test db         # runs the RLS tests — must be green before any UI talks to it
supabase gen types typescript --local > packages/core/src/db-types.ts
```

## Wiring (next session, ~1 sitting)

1. `pnpm add @supabase/supabase-js @supabase/ssr --filter web`
2. Implement `SupabaseRepo implements ApplicationRepo` in `apps/web/lib/repo-supabase.ts` —
   the UI already only talks to the `ApplicationRepo` port, so no screen changes.
   Map: application row + its events rows ⇄ `Application` (events embedded).
3. Magic-link auth: `/login` page + auth callback route; `RepoProvider` picks
   SupabaseRepo when a session exists, LocalStorageRepo otherwise (logged-out
   demo mode stays free).
4. "Migrate local data to account" button in Settings: read LocalStorageRepo →
   write SupabaseRepo (it's the import path with a different target).
5. Seed: on first login with zero rows, insert the 3 sample applications
   (`apps/web/lib/sample.ts`) — M2 acceptance criterion.

## Acceptance (from the plan)

- [ ] Magic-link signup/login
- [ ] RLS: cross-user access denied — select, insert, update, delete (tests exist, must pass in `supabase test db`)
- [ ] New accounts seeded with 3 sample applications
