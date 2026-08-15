# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Safen — an Expo / React Native (SDK 54, expo-router v6, TypeScript strict) personal-safety app: SOS alerts, emergency-contact fan-out, safe check-in watchdog, journey tracking, incident reports with media. Backend is Supabase (auth, Postgres, realtime) plus Firebase (phone OTP only) and Cloudinary (media).

## Commands

```bash
npm start                 # Metro / Expo dev server (add --clear after changing .env or native config)
npm run android           # expo run:android — needs a dev build, not Expo Go, for push/notifications
npm run lint              # expo lint (eslint-config-expo flat config)
npx tsc --noEmit          # type check — the main correctness gate
npx expo-doctor           # dependency/version sanity after touching package.json

npx supabase functions deploy send-feedback --no-verify-jwt   # Edge Functions live in supabase/functions/*
eas build --profile preview --platform android                # internal APK; profiles in eas.json
```

There is no test framework in this repo. "Verified" means `npx tsc --noEmit` and `npm run lint` both clean, plus running the app when behavior changed.

`postinstall` shell-deletes `node_modules/expo-firebase-core/{android,ios}` (a Gradle build fix) — it uses `rm -rf`, so `npm install` must run from Git Bash / a POSIX shell on Windows.

## Architecture

### Routing and gating
`app/_layout.tsx` owns the single Supabase session: it calls `getSession()` + `onAuthStateChange` and publishes the result through `SessionContext` (`src/context/SessionContext.ts`), wrapped in `ThemeProvider`, with `usePushNotifications(session?.user?.id)` registering the device token. `app/index.tsx` is the gate: no session → `/auth`; session but `PERMISSIONS_STORAGE_KEY` not set in AsyncStorage → `/permissions`; otherwise `/(tabs)`. Tabs are Home / Map / Report / Network (contacts) / Profile (settings).

### Hybrid auth (important)
Phone OTP runs through **Firebase** (`expo-firebase-recaptcha` + `PhoneAuthProvider` in `app/auth.tsx` → `app/verify.tsx`). After the Firebase credential succeeds, `verify.tsx` mints/uses a **Supabase** phone account with a shared hardcoded password so the app gets a Supabase session — Firebase is never the app's identity. Everything downstream (`supabase.auth.getUser()`, RLS) is Supabase. `src/lib/firebase.ts` no-ops when `EXPO_PUBLIC_FIREBASE_API_KEY` is absent. Phone numbers are normalized to E.164 Nigeria (`+234…`) before hitting either backend; the `profiles` table stores that form, so contact matching depends on it.

### Feature logic lives in hooks, not screens
`src/hooks/*` hold all domain logic; screens and `src/components/*` are presentation plus modal state.

- `useAlert` — insert into `alerts` (location fetched *first* via `getLastKnownPositionAsync` for speed), then fan out. Inserts with `description` and falls back to a description-less insert if the column is missing.
- `useSafeCheckIn` / `useJourneyTracking` — client-side session state persisted to AsyncStorage (`safen_active_check_in`, `safen_active_journey`) so it survives restarts; timers are re-derived from stored epoch timestamps, never counted up. Check-in fires at T-5min, T+0 and T+5min (contacts alerted).
- `useEmergencyRecording` — chunked video/audio evidence capture, uploads each chunk and patches `alerts.media_paths`.
- `useNotifications` — realtime `postgres_changes` subscription on `notifications` filtered by `recipient_id`, **plus** a 30s poll, **plus** an AppState-active refetch, **plus** a refetch on every `SUBSCRIBED`. That belt-and-braces recovery is deliberate; don't simplify it away.

### Notification model
Everything goes through `src/lib/notifications.ts`. Each `notify*` helper does two things: insert row(s) into the `notifications` table (the in-app feed, and the only path that works in Expo Go) and POST to `https://exp.host/--/api/v2/push/send` using `profiles.expo_push_token` (real device push). Helpers are best-effort — they catch everything and never throw, so a notification failure can never block an SOS or report. Cross-screen coupling uses the tiny bus in `src/lib/events.ts` (`contactEvents.emitRefresh()`), fired when an accept/decline notification arrives.

The `notifications.type` column has a DB constraint that predates journey tracking: `notifyJourneyStarted` / `notifyJourneyArrived` insert `type: 'report'` with a comment saying so. Fix the constraint before adding new types rather than piling on more casts.

### Expo Go vs dev build
`expo-notifications` is `require`d lazily behind an `isExpoGo` check (`Constants.executionEnvironment === ExecutionEnvironment.StoreClient`) in `useNotifications`, `usePushNotifications` and `useSafeCheckIn`, because it crashes in Expo Go on SDK 53+. Any new push/local-notification code must follow the same guard, and the Supabase-row path must remain the fallback so features stay demoable in Expo Go.

### Media
Uploads go to **Cloudinary**, not Supabase Storage — `src/lib/cloudinary.ts` posts via `expo-file-system/legacy`'s `uploadAsync` with an unsigned preset, 3 attempts with backoff. Resource type and a descriptive `public_id` are inferred from the URI so the resulting URL still identifies audio vs video. The `secure_url`s are stored in `reports.media_paths` / `alerts.media_paths`.

### Theming
`useTheme()` from `src/context/ThemeContext` returns `{ isDark, colors, toggleTheme }` over `LightTheme`/`DarkTheme` in `src/constants/Theme.ts` (note `colors.white` means "surface" and is dark in dark mode). The convention in components is `const styles = useMemo(() => getStyles(colors), [colors])` with a `getStyles(colors)` factory — follow it rather than a module-level `StyleSheet.create`. `app/auth.tsx` and `app/verify.tsx` still use local hardcoded `Colors` objects and are not theme-aware.

### Database
Full column-level schema, foreign keys and open questions live in **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** — read it before writing any query or assuming a column exists. Eight tables, with `profiles` (PK = `auth.users.id`) as the hub every other table points at.

Things that matter when writing code against it:

- The client only touches 7 of the 8 tables — `locations` (per-alert GPS breadcrumbs, FK → `alerts.id`) exists in the DB but nothing in `app/` or `src/` reads or writes it; live journey/alert positions are currently held in AsyncStorage only.
- `reports.user_id` is nullable to support anonymous reports; `notifications.sender_name` is a denormalized copy, so a profile rename does not rewrite history.
- Array columns (`alerts.media_paths`, `reports.media_paths`, `medical_profiles.conditions`/`medications`) hold Cloudinary URLs / plain text; `medical_profiles.allergies` is `jsonb`, not an array.
- Status values are plain `text` with defaults (`alerts.status='active'`, `reports.status='open'`, `emergency_contacts.status='accepted'`) — treated as enums by convention in code, not by the column type.
- There are no migration files in the repo; schema is managed in the Supabase dashboard and DATABASE_SCHEMA.md is a generated snapshot (regenerate it when you change the schema). Code must tolerate columns that may not exist yet — see the `useAlert` description fallback.

## Config and secrets

All client config is `EXPO_PUBLIC_*` in `.env` (git-ignored, but deliberately **not** in `.easignore` — EAS builds need it to inline the values). `app.config.js` injects `GOOGLE_MAPS_API_KEY` into `android.config.googleMaps` at config-resolution time; it will not appear in `app.json`. `EXPO_PUBLIC_AUTH_BYPASS_FIREBASE` is a temporary OTP-bypass flag for Firebase outages. `/android` and `/ios` are prebuild output and git-ignored.

## Conventions

- Feature work goes on a branch off `main` (current: `feat/ai-features`).
- `AIRiskCard` is currently a mocked demo (random scenario after a 2.5s fake scan) — treat it as a UI shell, not a real analysis pipeline.
- User-facing copy is written for high-stress moments: short, explicit, and it names who gets notified.
