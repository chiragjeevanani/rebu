# Development conventions

How work is built, tested and shipped in this repo. Read this before changing anything. It is written for a coding agent picking up the project mid-stream, but applies to humans too.

The project: **REBU**, a paid host-calling and live-streaming app (users buy coins and spend them on video/voice calls, chat, gifts and lives with hosts; hosts earn rupees and withdraw).

---

## 1. Ground rules

1. **Ask before anything outward-facing or irreversible.** Never `git push`, publish, deploy, send real SMS/payments, or delete data unless the user asked in this conversation. A previous "push" does not carry over to the next change.
2. **Secrets never enter git or the app.** Keys live only in `backend/.env` (git-ignored). The app gets public values only (e.g. the Razorpay *key id* comes from the server per order). Before every commit, scan the staged diff for keys (see §9).
3. **The server owns money and truth.** The app never decides balances, prices, call billing, rewards or task progress. It asks the server and shows what comes back.
4. **Read before you edit.** Match the surrounding file's style, naming and comment density. Don't reformat files you aren't changing.
5. **Verify, then report honestly.** Run the tests and lint; test on the device when the change is user-facing. If something wasn't tested, say so. If a test fails, show it.
6. **Prefer small, finished slices.** Wire one feature end to end (server → app → test on device) rather than half-wiring many.
7. **Tell the user what you're doing** in a sentence every few steps during long work.

---

## 2. Machine and tooling

- **Windows, and the C: drive is full.** Everything new goes on **D:** — SDKs, caches, browser profiles, temp builds. Existing locations:
  - JDK, Android SDK, Gradle, npm cache: `D:\DevTools\...`
  - adb: `D:\DevTools\Android\Sdk\platform-tools\adb.exe`
  - MongoDB 8 (portable): `D:\DevTools\mongodb`, data in `D:\DevTools\mongodb-data`
  - Chrome profiles for headless tools: `D:\DevTools\chrome-*`
- **Shell is Git Bash.** Known traps:
  - It rewrites arguments that look like paths (`/me`, `/sdcard/x.png`) into Windows paths. Prefix with `MSYS_NO_PATHCONV=1` (or `export` it) when passing API paths or device paths.
  - Template literals (`` `${x}` ``), `$` and nested quotes get mangled inside `node -e "..."` and heredocs. **For any non-trivial code edit, write a small Node script to a scratch file and run it, or use the editor tool — don't inline it in the shell.**
  - Foreground `sleep` chains may be blocked; poll with a loop that checks a condition instead.
- **Ports:** API `4000`, Metro `8081`, admin panel `5173`, MongoDB `27027` (replica set `rs0`). Port 27017 belongs to a different, pre-existing MongoDB service — leave it alone.

---

## 3. Repo layout

```
backend/   Node 22+ ESM API: Express 5, Mongoose 9, zod 4, Socket.IO 4
mobile/    React Native 0.88 (CLI, not Expo, not Flutter), Android first
frontend/  React 19 + Vite admin panel at src/modules/admin
builds/, reference/   git-ignored (release APKs, client docs)
```

---

## 4. Code style per package

| Package | Quotes | Semicolons | Formatter / linter |
| --- | --- | --- | --- |
| `backend/` | single | **no** | 2-space, keep lines readable |
| `frontend/` | single | **no** | `npx eslint src` |
| `mobile/` | single | **yes** | Prettier (`arrowParens: avoid`, `trailingComma: all`) + `npx eslint src` |

General:
- Comments explain *why*, briefly. No commented-out code.
- Flat, solid colours in UI; no gradients or "AI-looking" styling. Animations only where they already exist (navigation).
- Never use another app's name or branding in UI or copy.
- User-facing errors are friendly sentences ("You don't have enough coins."), never stack traces or codes.

---

## 5. Backend conventions (`backend/`)

**Run locally**
```bash
npm run db                                   # mongod on 27027, replica set rs0 (transactions need it)
node scripts/init-replset.js                 # first time only
npm run seed                                 # demo admins, users, hosts
node --watch --env-file=.env src/server.js   # API on :4000 with auto-reload
```

**Layout:** `src/core/` (errors, http helpers, auth, realtime, push), `src/modules/<name>/` (`*.model(s).js`, `*.routes.js`, `*.service.js`), mounted in `src/app.js` under `/api`. Admin routers live in `modules/admin/` and mount under `/api/admin`.

**Routes**
- `export const xRoutes = Router()`; wrap every handler in `ah()`.
- Validate every body and query with zod via `parse(schema, data)`. Unknown input is rejected, not ignored.
- Throw `ApiError` helpers (`badRequest`, `notFound`, `forbidden`, `conflict`, `insufficientCoins`). Never hand-write `res.status(4xx)`.
- Responses are plain objects: `{ call }`, `{ user }`; lists are `{ items, total, page, limit, pages }` via `paging()`/`paged()`. Errors are `{ error: { code, message, details } }`.
- Other users are sent with `user.toPublic()` (never phone numbers); the signed-in user with `user.toSelf()`.

**Money — the most important rule**
- Never touch `user.coins` or write ledger rows directly. Use `modules/wallet/economy.service.js`: `debitCoins`, `creditCoins`, `chargeUserPayHost`, `recordEarning`, `adjustEarnings`, `hostBalance`, `withTxn`.
- Every coin change writes a ledger row in the same transaction. Multi-step money operations go inside one `withTxn`.
- One-time rewards are protected by a unique index (e.g. `TaskClaim {user, taskId, period}`), not by "check then write".
- Prices, commissions, limits and catalogs come from `getConfig()` (admin-editable, cached). Never hard-code them. New config keys go in `config/defaults.js`, get a zod schema in `admin/config.routes.js`, and are exposed to the app (filtered) in `publicConfig()`. Anything secret in config must be stripped from `publicConfig()`.

**Realtime and notifications**
- Socket events: `toUser(id, event, data)`, `toLive(id, …)`, `toAdmins(…)`. Names are `domain:action` (`call:incoming`, `live:chat`).
- Tell a user about something with `notify(userId, { kind, title, body, image, deeplink })` from `modules/notifications`. It stores an inbox item, emits `notification:new`, and sends a phone push when they're offline. It never throws.
- Background jobs register with `onStartup` / `onShutdown` from `src/hooks.js`.

**Admin**
- Guard with `requireAdmin(Admin, '<section>')` using the panel's sections.
- Every state change writes `audit(req, action, target, meta)`.

**Safety**
- Free text that other people see (chat, moments, profiles, family names) goes through `checkContent()`, which blocks phone numbers, emails and flagged keywords.

**External services are env-switched and degrade quietly in dev:**
`OTP_PROVIDER` (mock/msg91/twilio), Razorpay keys, Agora keys (mock tokens without them), `FCM_SERVICE_ACCOUNT` (push no-op without it), `STORAGE` (local/cloudinary). Document every new env var in `.env.example` (blank) and the README.

---

## 6. Mobile conventions (`mobile/`)

- **API:** `src/api/client.js` (`get/post/patch/put/del`, `uploadImage(uri)`). In dev it calls `http://localhost:4000`, reached from the phone via `adb reverse`. Errors carry `e.code` / `e.message`. Handle `insufficient_coins` by sending the user to the `Wallet` (recharge) screen.
- **Sockets:** `src/api/socket.js` — `useSocketEvent(event, handler)` inside screens.
- **App state:** `src/context/AppContext.js` holds the session and server-backed state (user, coins, host money, store/VIP, unread count). Only device preferences (filters) are stored locally. When adding server data, add a `refreshX()` and call it on focus (`useFocusEffect`) or on the relevant socket event.
- **Shape adapters:** convert server objects once at the boundary (`toAppHost`, `toAppRoom`, `toAppChat`) so screens keep their existing shape.
- **Screens:** show a loading state, an error message, and an empty state. Buttons that call the server show `loading` and are disabled while busy. Mutations can be optimistic but must roll back on failure.
- **Calls and lives** use Agora through `src/media/agora.js` (`useAgoraChannel`). Use `RtcSurfaceView` for the full-screen video and `RtcTextureView` for small tiles layered over it.
- **Bottom sheets** use `components/Sheet.js` (already keyboard-aware). Purchases use `components/BuySheet.js` with an `onBuy` that returns the server response.
- **Screenshot blocking** (`src/utils/secure.js`, `SecureScreen?.enable()`) is on in shipped code. You may comment it out temporarily to take screenshots while testing; **always restore it before committing.**
- Bump `versionCode`/`versionName` in `android/app/build.gradle` and `APP_VERSION` in `src/api/client.js` together for release builds.

---

## 7. Admin panel conventions (`frontend/src/modules/admin`)

- API client in `api/client.js` (token in localStorage, 401 → login), sockets in `api/socket.js`, data hooks in `hooks/useApi.js`.
- Vite proxies `/api`, `/uploads` and `/socket.io` to `:4000` in dev; production uses `VITE_API_URL`.
- Pages use the shared components in `components/ui.jsx` (DataTable with server paging, loading/error/empty states).
- If a page needs data the server doesn't have yet, mark it `// TODO(api): <wanted request → response>` instead of faking it.
- Check with `npm run build` and `npx eslint src`.

---

## 8. Testing

### 8.1 Automated (backend)
- `npm test` in `backend/` runs every suite, each on a **fresh, throwaway database and port**. All suites must pass before you report a backend change as done.
- Run one suite while iterating: `node --env-file=.env scripts/test-all.js social`.
- Suites are end-to-end: they start a real server and call the HTTP API and sockets as real users and admins. When you add or change an endpoint, add checks to the matching `scripts/test-*.js` — both the happy path and the important refusals (not enough coins, already claimed, wrong owner, blocked content).
- Every suite **refuses to run against the dev database** (`/rebu`). Never bypass that guard; the dev data is what the user sees on their phone.

### 8.2 Lint
- `npx eslint src` in `mobile/` and `frontend/`: **0 errors** required. Don't add new warnings in code you touch.
- Bundle check for mobile without a device: `npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output D:/DevTools/tmp-bundle/index.android.bundle --assets-dest D:/DevTools/tmp-bundle/res` (then delete the folder).

### 8.3 On a real phone
User-facing changes are tested on the user's Android phone over wireless adb.

**Connect**
```bash
A=/d/DevTools/Android/Sdk/platform-tools/adb
$A mdns services          # find the phone (needs Wireless debugging ON)
$A devices                # use the "adb-…._adb-tls-connect._tcp" transport
$A -s "<serial>" reverse tcp:8081 tcp:8081
$A -s "<serial>" reverse tcp:4000 tcp:4000   # re-run after every reconnect
```
- If the phone isn't listed, ask the user to unlock it and toggle **Developer options → Wireless debugging**. A USB cable is much faster and more stable.
- **Never keep two transports to the same phone** (the mDNS one plus an `IP:port` one). Every command becomes very slow. `adb disconnect <IP:port>` the extra one.
- Keep the screen awake while testing: `shell svc power stayon true`.

**Drive and inspect**
- Screenshot: `shell screencap -p /sdcard/s.png`, then `pull` it (avoid `exec-out` over Wi-Fi; it corrupts large files). Screenshots are 1080×2400; viewers often scale them, so convert coordinates before tapping.
- `shell input tap X Y`, `input text "word%sword"` (`%s` = space; emoji can't be typed this way), `input keyevent 4` (back), `input swipe …`.
- JS logs: `shell logcat -d -s ReactNativeJS:V`.
- **Wait for the result before the next tap.** Over slow links a screenshot can lag by seconds; a second tap may hit the *next* screen (e.g. "Next random call"). Confirm with server logs if in doubt.
- Restart the app: `am force-stop com.rebu.app` then `monkey -p com.rebu.app -c android.intent.category.LAUNCHER 1`. If Metro hangs at 99% or the app shows "Fast Refresh disconnected", restart the app (and Metro with `--reset-cache` if needed).

**The other side of a feature** (one phone can't be both caller and host)
- `GET /dev/host-sim?phone=9000000001[&live=1]` — a demo host that goes online, auto-accepts calls, replies to chats, can go live and accepts join requests.
- `GET /dev/user-sim?to=<hostPhone>&secs=75` — a test user that calls a host.
- `GET /dev/viewer-sim?to=<phone>` — a test user that joins the phone's live/room, chats, gifts and asks for a seat.
- Run them in headless Chrome with a fake camera:
  `chrome.exe --headless=new --remote-debugging-port=9334 --user-data-dir=D:/DevTools/chrome-hostsim --use-fake-device-for-media-stream --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required "http://localhost:4000/dev/host-sim?phone=9000000001"`
  and read their on-page log through the DevTools protocol (`Runtime.evaluate` on `document.getElementById('log').textContent`).
- To act as another user from a script, sign a token for that user (`signUserToken`) and call the API — useful for "someone liked your moment / followed you / sent a gift" checks.
- `/dev/*` routes exist only when `NODE_ENV` isn't production.

**What "tested on device" means:** do the real user flow, then confirm the result in three places — the phone's screen, the server log or response, and the other party (simulator or second user). Example: buy an item → coins drop on screen → ledger row exists → item is equipped on the profile.

**Clean up after testing:** stop simulators, restore anything you changed in the dev data (e.g. demo hosts' online flags), and restore screenshot blocking. Tell the user what test data you left on their account.

---

## 9. Git

- Branch: `main`, remote `origin` (GitHub). Commit or push **only when the user asks**.
- Before committing:
  1. `git status` and review what's staged.
  2. Make sure no `.env`, `uploads/`, `node_modules/`, APK/AAB or service-account file is staged.
  3. Scan the diff for secrets: `git diff --cached | grep -nE "rzp_(test|live)_[A-Za-z0-9]{10}|BEGIN (RSA )?PRIVATE|<known key fragments>"`.
  4. Screenshot blocking restored; tests and lint pass.
- Commit messages: a short summary line, then a plain-language body of what changed and why. End with any attribution line the environment asks for.

---

## 10. Demo accounts (dev only)

- App user: phone `9999999999`, OTP `123456`.
- Demo hosts: `9000000001`–`9000000006` (OTP is printed in the server log in dev).
- Admin panel: `admin@rebu.app` / `admin123` (other roles in `backend/scripts/seed.js`).

---

## 11. Reporting back to the user

- Lead with the outcome: what works now, what you fixed, and what isn't done or wasn't tested.
- Use plain language and the app's own words (screens, buttons), not internal names.
- Mention anything that changed the user's data, anything you couldn't verify, and anything that needs their accounts or keys (SMS provider, Firebase, Cloudinary, hosting).
