# REBU backend

Node.js (ESM) + Express 5 + MongoDB (Mongoose 9) + Socket.IO + Agora tokens.

## Run locally

```bash
# 1. Database (portable MongoDB on D:, replica set so transactions work)
npm run db                        # MongoDB on 127.0.0.1:27027 (replica set rs0)
node scripts/init-replset.js      # first time only

# 2. API
cp .env.example .env              # then set JWT_SECRET (and Agora keys when you have them)
npm install
npm run seed                      # admins, demo user, demo hosts
npm run dev                       # http://localhost:4000  (GET /health)
npm test                          # every module's end-to-end suite, each on a fresh database
```

Demo logins: app phone `9999999999` / OTP `123456`; demo hosts `9000000001`–`9000000006` (OTP is printed in the server log and returned as `devCode` in dev). Admin: `admin@rebu.app` / `admin123` (see seed for other roles).

## Layout

```
src/
  server.js            boot: db → config → http → sockets → hooks
  app.js               express app + route mounting (all under /api)
  hooks.js             onStartup/onShutdown for background jobs (billing timers…)
  config/              env.js (all env vars), db.js
  core/
    errors.js          ApiError + helpers (badRequest, notFound, insufficientCoins…)
    http.js            ah() async wrapper, parse(zodSchema, data), paging()/paged()
    auth.js            JWTs, requireUser(User), requireHost, requireAdmin(Admin, section)
    realtime.js        Socket.IO: toUser(id, evt, data), toLive(id, …), toAdmins(…)
  modules/<name>/      *.model(s).js, *.routes.js, *.service.js
```

## Conventions (read before adding code)

- **Style:** ESM, single quotes, no semicolons, 2-space indent.
- **Routes:** `export const xRoutes = Router()`; wrap handlers in `ah()`; validate every body/query with zod via `parse()`; throw `ApiError` helpers, never `res.status(4xx)` by hand. Responses are plain JSON objects (`{ call }`, `{ items, total, page, limit, pages }` for lists). Errors are `{ error: { code, message, details } }`.
- **Money:** never touch `user.coins` or write `CoinTxn`/`Earning` directly. Use `modules/wallet/economy.service.js`: `debitCoins`, `creditCoins`, `chargeUserPayHost`, `recordEarning`, `adjustEarnings`, `hostBalance`, `splitEarning`, `withTxn`. Out-of-coins surfaces as `402 insufficient_coins`.
- **Config:** read prices/commission/limits with `getConfig()` (cached; admin saves update it). Never hard-code them.
- **Agora:** `rtcToken({ channel, userId, role })` and `channelName(kind, id)` from `modules/agora/agora.service.js`. Without keys it returns `mock: true` so flows still work.
- **Realtime:** emit with `toUser`/`toLive`; event names are `domain:action` (e.g. `call:incoming`, `live:chat`).
- **Public shapes:** send other users via `user.toPublic()`, the signed-in user via `user.toSelf()`. Never send phone numbers of other users.
- **Admin routes:** `requireAdmin(Admin, '<section>')` with the same sections as the admin panel; record every state change with `audit(req, action, target)`.
- **Background jobs:** register with `onStartup`/`onShutdown` from `src/hooks.js`.

## Payments & media

- **Razorpay:** with `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` set, `POST /api/wallet/orders` creates a real order and returns `checkout` for the app. Coins are credited only after the server verifies the checkout signature and Razorpay reports the payment captured for the right amount (`POST /api/wallet/orders/:id/confirm` with `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`), or from the signed webhook at `POST /api/webhooks/razorpay` (needs `RAZORPAY_WEBHOOK_SECRET` and a public URL). Dev-only browser checkout: `GET /dev/checkout/<orderId>`.
- **Agora:** with `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` set, calls and lives return real RTC tokens; channels are `rebu_call_<id>` and `rebu_live_<id>`.
- Keys live only in `.env` (git-ignored).
- **SMS (OTP):** `OTP_PROVIDER=msg91` (`MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` — a DLT-approved template with an `##OTP##` variable) or `OTP_PROVIDER=twilio` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`). `mock` (default) prints the code. An app-store reviewer number/code can be set in the admin panel (App settings → OTP); it never reaches the app's `/config`.
- **Push:** `FCM_SERVICE_ACCOUNT` = path to (or the JSON of) a Firebase service account. Without it push is a quiet no-op; the in-app inbox still works. Incoming calls ring as high-priority pushes when the host's app isn't connected.
- **Uploads:** `STORAGE=cloudinary` + `CLOUDINARY_URL=cloudinary://key:secret@cloud` in production; the default writes to `uploads/` on local disk (dev only).

## Feature map

| Area | App routes | Admin routes |
| --- | --- | --- |
| Moments | `/api/moments` (feed, post, like, comments) | `/api/admin/moments` (flagged/remove/approve) |
| Store, VIP, royal club, diamonds | `/api/store` (all bought with coins) | config keys `storeItems`, `vipTiers`, `royalClub`, `diamondsPerCoin` |
| Tasks | `/api/tasks` (progress counted on the server) | config key `tasks` |
| Families | `/api/families` | config key `families` |
| Leaderboard, visitors, "Say hi" | `/api/social/*` | — |
| Notifications inbox | `/api/notifications` | broadcasts: `/api/admin/content/notifications` |
| Profile verification | `POST /api/me/verification` | `/api/admin/users?verification=pending`, `PATCH /api/admin/users/:id {verified}` |

`npm test` runs every suite (wallet/hosts, calls/chat/gifts, lives/rooms, social, admin) on throwaway databases. The suites refuse to run against the dev database (`rebu`).
