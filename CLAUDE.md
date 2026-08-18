# Safen — Project Context for Claude Code

Personal safety app for Nigerian users — a community-powered safety and
distress platform. Solo-built by Georgie (36 weeks, 4 phases).

## Stack
- **Frontend:** Expo / React Native
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Auth:** Firebase OTP (Nigerian phone numbers, normalized via `toE164Nigeria`).
  Previously Twilio — do not reintroduce Twilio-based flows.
- **Media:** Cloudinary uploads via `FormData + fetch` — this is the working
  approach after several failed attempts. Don't suggest switching upload
  strategy without a strong reason.
- **Session:** `SessionContext` handles persistence app-wide.

## Database schema (Supabase, RLS enabled on all tables)
- `profiles`
- `emergency_contacts`
- `alerts`
- `locations`
- `reports`

When touching any table, assume RLS policies are in effect and check them
before assuming a query will succeed for a given role.

## Known gotchas / recurring bugs
- **`getUser()` vs `getSession()`**: storage-auth operations need
  `getSession()`, not `getUser()`. This has bitten the project before —
  check this first if a storage/auth call silently fails.
- Emergency Contacts CRUD relies on Supabase membership verification —
  don't bypass this when refactoring.

## Key features already built
- SOS button + Quick Actions → wired to `alerts` table
- Report screen: MapView + reverse geocoding + media capture
- Full OTP verify screen (Firebase-based)
- Emergency Contacts CRUD

## Git workflow
- Repo: https://github.com/GeorgieGeorge-jr/safen
- Solo-developed; historical branch conflicts (with a prior collaborator's
  branch) were resolved via `--rebase`. Prefer rebase over merge when
  reconciling branches here.

## Conventions
- Keep Nigerian-context specifics explicit (phone format, locale
  assumptions) rather than generic i18n abstractions — this app is
  intentionally Nigeria-first.
- When suggesting fixes, prefer minimal diffs that match existing patterns
  in the file over introducing new libraries/state patterns.

## What NOT to do
- Don't reintroduce Twilio.
- Don't propose a different media-upload strategy without being asked —
  the Cloudinary/FormData approach was hard-won.
- Don't assume `getUser()` is safe for storage auth checks.
curl -fsSL https://claude.ai/install.sh | bash (macOS/Linux/WSL)