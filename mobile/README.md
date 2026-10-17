# GHAYA — iOS & Android app

A standalone **Expo / React Native** app for GHAYA Estate, covering **buyer, broker, developer and CEO**,
tied to **the exact same live data as the website** — same server, same session, same permissions,
at the same moment.

---

## Why there is no mobile backend

The app talks to the Next.js API directly. Nothing is mirrored, cached into a second database, or
re-implemented:

| Concern | How it is handled |
| --- | --- |
| Data | The same `/api/*` routes the website calls |
| Session | The **same JWT** a browser login mints (`POST /api/mobile/auth/login`) |
| Permissions | Whatever the web allows/denies, the app allows/denies |
| Storage | `prisma/dev.db` / production DB — one source of truth |

### The `X-Session-Token` channel

React Native cannot be trusted to send a hand-written `Cookie` header — browsers forbid it outright,
and RN delegates to native cookie stacks (NSURLSession on iOS, OkHttp on Android) that may drop or
rewrite it. So the app authenticates with a bespoke header instead:

```
GET /api/ceo/brokers
X-Session-Token: <the session JWT>
```

`src/middleware.ts` folds that header back into a real session cookie **before any route handler
runs**, using the same cookie name auth.js would have used in that environment. Downstream the
request is indistinguishable from a browser's — which is the whole point.

The middleware only matches `/api/:path*` **when the header is present**, so ordinary website
traffic (including file uploads) never enters middleware at all.

Verified end to end:

| Caller | `GET /api/ceo/users` | `GET /ceo/users` |
| --- | --- | --- |
| CEO token | 200 | 200 |
| Broker token | 403 | 307 → `/dashboard` |
| No token | 401 | 307 → `/auth/login` |

---

## Running it

```bash
# 1. the website API must be up
npm run dev                                   # http://localhost:3000

# 2. the app
cd mobile
cp .env.example .env                          # then set EXPO_PUBLIC_API_URL
npx expo start --dev-client                   # your own build (needed for push)
```

**Which URL goes in `.env`?**

| Where it runs | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| iOS simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| A physical phone | `http://<mac-lan-ip>:3000` — same Wi-Fi. `ipconfig getifaddr en0` |
| Production | `https://ghayaestate.com` |

### Other commands

```bash
npx expo start --ios        # iOS simulator (requires Xcode)
npx expo start --android    # Android emulator (requires Android Studio)
npx expo export --platform ios      # production JS bundle
npx expo export --platform android
npx tsc --noEmit            # typecheck
npx expo lint
```

> **iOS builds.** Expo Go runs this immediately with no Apple account. Shipping to TestFlight/App
> Store needs an Apple Developer account and either `eas build` (cloud) or a local Xcode build —
> the native identifiers are already set in `app.json` (`eg.estateai.ghaya`).

---

## Structure

```
src/
  api/
    config.ts        API base URL (env-driven, per-platform defaults)
    client.ts        fetch wrapper — attaches X-Session-Token, maps errors
    session.ts       JWT persisted in the Keychain / Android Keystore
  auth/
    auth-context.tsx sign-in / sign-out / refresh / hasRole
  components/
    ui.tsx           screen shell, cards, rows, buttons, chips — all RTL-aware
  constants/
    brand.ts         GHAYA palette, lifted from tailwind.config.ts + globals.css
  hooks/
    use-api.ts       one GET per path: loading / error / pull-to-refresh
  i18n/
    define.ts        defineMessages() — [English, Arabic] tuples
    index.tsx        I18nProvider, t(), row / align / text / localized
    messages/        one dictionary per screen or feature
  lib/
    links.ts         website URL → app route (shared by push + notifications)
    push.ts          permission, token registration, tap-to-open
    theme.tsx        ThemeProvider, useTheme(), createStyles() — light/dark
    currency.tsx     display currency, rates from /api/settings
    saved-projects.tsx  device-local project bookmarks
    compare.tsx      compare tray
  app/
    _layout.tsx      root: providers + splash + route gate + notification navigation
    (tabs)/          index, explore, leads, deals, saved, tools, manage
    ceo/             overview, viewings, inquiries, approvals, content, pricing, analytics
    project/ unit/   detail screens
    developer.tsx    developer portal
```

Sign-in hits `POST /api/mobile/auth/login`, which rate-limits (8 / 5 min), applies the same
checks as the website's `authorize()` — active account, `status: ACTIVE`, bcrypt match — and
returns a 30-day JWT. The token lives only in platform-secure storage.

---

## What is built

Every screen reuses `apiFetch` and the GHAYA design system:

1. **Public / buyer** — explore with the full filter set, project detail, **unit detail**, compare,
   mortgage / investment / price-estimator calculators, AI assistant, **AI natural-language search**
   (`POST /api/ai/search`), saved searches (create / alert toggle / delete), saved projects,
   server-side favorites and watch-price, booking a viewing, my appointments, **my inquiries**,
   notifications (deep-linked into the right screen), **invitation-only registration** and a full
   **settings screen** (notification preferences, property preferences / Client DNA, change
   password, language, theme, display currency).
2. **Broker** — **broker portal** (`/broker`) with Overview · Leads · Deals · Commissions ·
   Projects, backed by `GET /api/broker/portal`, which mirrors the website's server component
   query-for-query. **Lead creation** with live duplicate detection, deal pipeline and lead detail
   with status updates and notes.
3. **Developer console** (`/developer`) — company profile, partnership terms, project list with
   milestones, lead funnel (phone numbers masked exactly as `/api/leads` masks them), deals and
   commissions. Backed by `GET /api/developer/portal`, which mirrors the website's server
   component query-for-query.
4. **CEO console** (`/ceo/*`) — overview KPI board, viewings with status transitions, inquiries
   triage, approvals queue, AI content studio, repricing, analytics, **plus user, project, unit,
   deal & commission, broker and platform-settings management and the AI command center**.
   `/api/ceo/approvals` and `/api/ceo/content` had no consumer on the web at all; the app is their
   first UI.
5. **Shared** — sign-in with the website's own JWT, display-currency switch backed by platform
   settings rates, compare tray, catch-all 404, **Arabic/English with RTL**, **push
   notifications**, and a **client-side role gate** on every console screen.

### Authorization

The server is the authority — every `/api/ceo/*`, `/api/broker/*`, `/api/developer/*` route calls
`requireActor()` and answers 403 on its own. On top of that, each console screen opens with

```ts
const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
if (denied) return denied;
```

so a wrong-role deep link shows a refusal instead of an empty console full of error strips.
`hasRole` returns true for CEO and ADMIN on every check — the same "super roles act as everyone"
rule `src/middleware.ts` enforces — so callers pass only the roles the screen is genuinely for.
The two creation forms gate to match their routes exactly: `POST /api/leads` is
`BROKER | CEO | ADMIN` and `POST /api/deals` is `CEO | ADMIN | DEVELOPER`.

---

## Backend changes

The website's `src/` tree was almost untouched — the app was built to consume it, not to fork it.

| Change | Why |
| --- | --- |
| **`GET /api/broker/portal`** (new route) | The **only** endpoint that was genuinely missing. `/broker/page.tsx` ran six Prisma queries inside a server component, so unlike the developer portal there was no HTTP surface for the app to call. It mirrors that page query-for-query and returns the same prop shapes, reusing `requireActor()` for the gate. No schema change. |
| **`GET /api/inquiries` now scopes by role** | **Security fix.** The route had no role gate beyond authentication, so any signed-in *buyer* received the **entire table** — every other customer's name, phone, email and message body. It now limits non-staff roles to `userId = self`; brokers keep `assignedTo = self`, and CEO/ADMIN/DEVELOPER keep the full inbox the website's `/dashboard/inquiries` already relies on. |

No Prisma schema change was required, and no endpoint was removed, renamed or given a different
payload. Everything else the app needs already existed — see *What is built* for how each screen
maps onto it.

**Website impact:** `npm run build` and `npx tsc --noEmit` both pass, and no page, component or
existing route was deleted or altered apart from the inquiries scoping above.

---

`src/i18n/` is a small bilingual runtime modelled on the website's `LanguageProvider`:

```ts
const { t, row, text, align, isRtl, lang, setLang, localized } = useI18n();
```

- Dictionaries live in `src/i18n/messages/*.ts`, one file per screen or feature:
  ```ts
  export const home = defineMessages({
    'home.greeting': ['Good morning', 'صباح الخير'],   // [English, العربية]
  });
  ```
  Two facts are enforced by the compiler rather than by review: the key space is a **typed union**
  (`t('typo.here')` does not compile), and `ar` is a tuple element of every entry, so **a string
  cannot ship untranslated**.
- Choice is device-local (`expo-secure-store`, key `ghaya.lang`) — same rule as the currency
  switch, no server round trip.
- **RTL is applied explicitly**, not through `I18nManager.forceRTL()`. That call flips the layout
  only after the native bundle restarts, which would strand an Arabic user in a left-to-right app
  until they killed it. Kit components read `isRtl` instead and pick `row-reverse` / `right`
  themselves, so the switch is instant and behaves identically on iOS, Android and web.
  - `row` → merge into any container whose style is `flexDirection: 'row'`
  - `align` → `textAlign` + `writingDirection`, for text on the reading edge
  - `text` → `writingDirection` only, safe on **centered** text (it will not move it)
  - `localized(en, ar)` → prefers a model's `*Arabic` column when Arabic is on

The website keeps its own independent choice (localStorage, key `estateai-lang`) — neither
side pretends to be the other's source of truth.

---

## Design parity with the website

The app is not "inspired by" the site — its tokens are **lifted from it, value for value**, so
both clients read as one product:

| From the website | Where it lands in the app |
| --- | --- |
| `:root` HSL block in `src/app/globals.css` | `lightTheme` in `src/constants/brand.ts` |
| `.dark` HSL block in `src/app/globals.css` | `darkTheme` in `src/constants/brand.ts` |
| `theme.extend.colors.estate` in `tailwind.config.ts` | `Estate` (unchanged, theme-independent) |
| `--radius` + Tailwind's fixed steps | `Radius` — `md` 6 (buttons/inputs), `lg` 8 (cards), `xl` 12, `xxl` 16 (image cards), `full` |
| `text-xs … text-3xl` | `Type` |
| `src/components/ui/{button,badge,card,input}.tsx` | the recipes behind `Btn`, `Badge`, `Card`, `Field` in `src/components/ui.tsx` |
| The navbar (`h-16`, hairline, gold accent) | the stack header, the tab bar, and `ThemeToggle` |

Both sides resolve to the **system font**, and both default to **`system`** for the colour scheme,
so a phone and a browser side by side pick the same palette at the same moment.

### Light / dark / system

`src/lib/theme.tsx` owns the choice and stores it under `ghaya.theme` — the same
`localStorage`-rather-than-server rule the website's language and theme switches follow.

```ts
const { preference, mode, t, setPreference } = useTheme();
// t is the live ThemeTokens; `mode` is what is actually painted
```

`ThemeToggle` in `src/components/ui.tsx` renders the website's theme menu — a round bordered icon
button that drops the same **Light / Dark / System** rows with the active one in estate gold — and
sits in `headerRight` on every stack and tab screen, exactly where the site puts it in the navbar.

### Why styles are a hook

React Native has no CSS: `StyleSheet.create` freezes colours into plain objects at module scope,
so a module-level sheet can never repaint. Every screen therefore declares its sheet through a
factory and reads it back with a hook:

```tsx
const useStyles = createStyles((t) => StyleSheet.create({ card: { backgroundColor: t.card } }));

function Screen() {
  const styles = useStyles();          // first statement — this is what repaints on theme change
  …
}
```

Tokens read **outside** the sheet (an icon colour in JSX) go through `const { t: theme } =
useTheme()` — aliased to `theme` so it can never collide with i18n's `t`.

### Deliberate deviations

Three places the app is intentionally not a literal copy, all of them mobile-first:

1. **Input font size is 16px**, not the site's `text-sm` 14px — anything smaller makes iOS Safari
   zoom the field on focus.
2. **The header/tab-bar surface is opaque** (`#FFFFFF` / `#030712`), not the navbar's translucent
   `bg-white/95` + `backdrop-blur`. Same base colour, but RN has no backdrop blur worth using here.
3. **The website's `/ceo` console ignores its own theme** — `src/app/ceo/layout.tsx` hardcodes
   `bg-estate-bg-dark` and a navy header in both modes. The app's CEO screens follow the toggle
   like every other screen; in dark mode the two are visually identical (`#080E16` vs `#080E1A`).

---

## Push notifications

End to end, and fail-soft at every step:

| Piece | Where |
| --- | --- |
| Permission, Android channel, Expo token | `src/lib/push.ts` (`registerForPush`) |
| Token storage | `POST /api/mobile/push-token` → `PushSubscription` (one row per user+token) |
| Send | `src/lib/push.ts` on the server — plain `fetch` to Expo's push API, batched by 100 |
| Hook | `src/lib/notify.ts` — every in-app notification also pushes; the DB row is written first |
| Preferences | `NotificationPreference.push*` flags are honoured per notification type |
| Tap → screen | `useNotificationNavigation()` + `src/lib/links.ts` (`resolveLink`) |
| Revoke | `DELETE /api/mobile/push-token?token=…` on sign-out; dead tokens pruned on send |

**Registration carries the session.** `/api/mobile/push-token` is gated by `requireActor()`, so
`registerForPush` and `revokePush` both take the live session credentials and `apiFetch` forwards
them as `X-Session-Token`. Calling either without them is a silent 401 that surfaces as a generic
failure — which is exactly what happened before this was wired, and why both call sites (root
layout on sign-in, Tools button on demand) pass `session`.

Sign-out revokes **before** `clearSession()`, because the revoke call is itself session-gated.

`expo-notifications` is iOS/Android-only and throws on import on web, so the module is loaded
lazily and a failure degrades to "no push", never to a crash.

**One command lights it up:** push needs an EAS project id, which requires an Expo account:

```bash
cd mobile && npx eas init     # writes extra.eas.projectId into app.json
npx expo run:ios              # expo-notifications is native — needs a dev build, not Expo Go
```

Until then the Tools screen says exactly why (see *Push notifications* → "No Expo project is
linked yet"), and everything else in the app works.

---

## Storage, and running it in a browser

`src/lib/storage.ts` is the app's one key–value store, and it exists because `expo-secure-store`
doesn't have a web build: its `.web.js` module is literally `export default {}`, so every call
into it throws `... is not a function`. That was not cosmetic — sign-in died outright under
`expo start --web`, because `saveSession()` rejected before the token was ever written.

| Platform | Backed by |
| --- | --- |
| iOS / Android | Keychain / Keystore via `expo-secure-store` — unchanged, never plaintext |
| Web | `localStorage` — a browser has no keychain, and this is the same JWT the website's own JS handles during login |

Session, language, currency, the compare tray and saved projects all go through it, so the five
call sites behave the same on both platforms. Every write is fail-soft: a store that refuses to
open degrades to "did not persist", never to a crash or a sign-in that appears to fail.

**The browser build also needs the API's CORS allowlist.** Metro serves the web bundle from 8081
while the API runs on 3000, so every call it makes is cross-origin, and browsers refuse those
silently — `fetch` just rejects with `TypeError: Failed to fetch`. `src/middleware.ts` answers the
preflight and echoes the grant back to **loopback and RFC1918 origins only**, so no public origin
can ever receive one. Native iOS/Android have no CORS rule at all and are untouched by this.

---

## Still to build

1. **`expo-updates`** so an Arabic/RTL or copy change can ship without an app-store release.
2. **Broker charts** — `/api/ceo/stats` powers the CEO analytics screen; there is no
   `GET /api/broker/stats` on the website either, so the broker portal draws its pipeline from the
   aggregates `GET /api/broker/portal` computes. A dedicated stats route would be new backend work.
3. **`npx expo run:android`** cannot run in this environment (no JDK, no Android SDK,
   `ANDROID_HOME` unset). The Android project is verified through
   `npx expo export --platform android`, `npx expo-doctor` and `npx expo prebuild`, all of which
   pass; to build it for real, install a JDK + Android SDK and run `npx expo run:android`.
