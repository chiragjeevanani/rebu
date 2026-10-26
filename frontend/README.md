# REBU web (admin panel)

React 19 + Vite. Modules live in `src/modules/<module>/` (`admin` now; `website` and `agency` later).

## Run

```bash
npm install
npm run dev        # http://localhost:5173/admin
npm run build
npm run lint
```

## Admin panel

Demo sign-ins (test build only — remove before launch):

| Role | Email | Password |
|---|---|---|
| Super admin | admin@rebu.app | admin123 |
| Moderator | priya@rebu.app | mod123 |
| Finance | neha@rebu.app | finance123 |
| Support | rohit@rebu.app | support123 |

- `data/seed.js` — demo data; the top comment documents every record shape.
- `data/StoreProvider.jsx` — all data + actions (`update`, `create`, `remove`, `setConfig`, `log`). Each action is the single place where the backend API call goes; until then data is kept in the browser (App settings → Danger zone → Reset demo data).
- `routes/nav.js` — sidebar, roles and which sections each role can open.
- `components/ui.jsx`, `components/charts.jsx`, `styles/admin.css` — the shared UI kit.
- `db.config` (economy, coin packs, gifts, host levels, VIP, app settings) is what the mobile app will fetch on launch.
