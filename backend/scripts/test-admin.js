// End-to-end checks for the admin API and /api/reports against a running server.
// Fixtures that other modules would normally create (users, withdrawals, calls,
// payments) are written straight to the database.
//
//   MONGO_URI=... PORT=4104 npm start          (in another shell)
//   MONGO_URI=... API=http://localhost:4104 node --env-file-if-exists=.env scripts/test-admin.js
import mongoose from 'mongoose'
import { connectDb, disconnectDb } from '../src/config/db.js'
import { loadConfig } from '../src/modules/config/config.service.js'
import { signUserToken } from '../src/core/auth.js'
import { User } from '../src/modules/users/user.model.js'
import { CoinTxn, Payment } from '../src/modules/wallet/wallet.models.js'
import { Earning, Withdrawal } from '../src/modules/earnings/earnings.models.js'
import { AuditLog } from '../src/modules/audit/audit.model.js'
import { Admin } from '../src/modules/admins/admin.model.js'
import { recordEarning } from '../src/modules/wallet/economy.service.js'

// Never run against the dev database by accident: these tests spend coins.
if (/\/rebu(\?|$)/.test(process.env.MONGO_URI || '') && !process.env.FORCE) {
  console.error('Refusing to run against the dev database (rebu). Use npm test, or set FORCE=1.')
  process.exit(1)
}

const API = process.env.API || `http://localhost:${process.env.PORT || 4104}`
const TAG = Date.now().toString().slice(-7)
let pass = 0
const fails = []

function check(name, ok, detail) {
  if (ok) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fails.push(name)
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}` : ''}`)
  }
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    /* empty */
  }
  return { status: res.status, data }
}
const as = token => ({
  get: p => call('GET', p, { token }),
  post: (p, body) => call('POST', p, { token, body }),
  patch: (p, body) => call('PATCH', p, { token, body }),
  put: (p, body) => call('PUT', p, { token, body }),
  del: p => call('DELETE', p, { token }),
})

async function login(email, password) {
  const r = await call('POST', '/api/auth/admin/login', { body: { email, password } })
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`)
  return as(r.data.token)
}

let phoneSeq = 0
const mkUser = (extra = {}) =>
  User.create({ phone: `6${TAG}${String((phoneSeq += 1)).padStart(2, '0')}`, name: `Test ${TAG}-${phoneSeq}`, profileDone: true, coins: 0, lastActive: new Date(), ...extra })
const userApi = u => as(signUserToken(u))
const section = t => console.log(`\n${t}`)

await connectDb()
await loadConfig()

const health = await fetch(`${API}/health`).catch(() => null)
if (!health?.ok) {
  console.error(`Server not reachable at ${API}`)
  process.exit(1)
}

const sup = await login('admin@rebu.app', 'admin123')
const mod = await login('priya@rebu.app', 'mod123')
const fin = await login('neha@rebu.app', 'finance123')
const sp = await login('rohit@rebu.app', 'support123')
const supId = (await sup.get('/api/admin/me')).data.admin.id

// ── 1. Role access ───────────────────────────────────────────────────────
section('Role access')
check('no token → 401', (await call('GET', '/api/admin/users')).status === 401)
for (const [who, api, path, want] of [
  ['super', sup, '/api/admin/dashboard?days=7', 200],
  ['super', sup, '/api/admin/finance/withdrawals', 200],
  ['super', sup, '/api/admin/admins', 200],
  ['super', sup, '/api/admin/audit', 200],
  ['moderator', mod, '/api/admin/reports', 200],
  ['moderator', mod, '/api/admin/applications', 200],
  ['moderator', mod, '/api/admin/content/banners', 200],
  ['moderator', mod, '/api/admin/finance/transactions', 403],
  ['moderator', mod, '/api/admin/finance/withdrawals', 403],
  ['moderator', mod, '/api/admin/admins', 403],
  ['moderator', mod, '/api/admin/audit', 403],
  ['finance', fin, '/api/admin/finance/revenue?days=30', 200],
  ['finance', fin, '/api/admin/hosts', 200],
  ['finance', fin, '/api/admin/reports', 403],
  ['finance', fin, '/api/admin/content/pages', 403],
  ['support', sp, '/api/admin/support', 200],
  ['support', sp, '/api/admin/calls', 200],
  ['support', sp, '/api/admin/finance/disputes', 403],
  ['support', sp, '/api/admin/agencies', 403],
  ['any admin', sp, '/api/admin/config', 200],
]) {
  const r = await api.get(path)
  check(`${who} GET ${path.replace('/api/admin', '')} → ${want}`, r.status === want, `${r.status} ${JSON.stringify(r.data?.error || '')}`)
}
const dash = (await sup.get('/api/admin/dashboard?days=30')).data
check('dashboard has kpis, live, attention, 30-day series', dash?.kpis?.revenue && dash.live && dash.attention && dash.series?.length === 30, dash)
const econ0 = (await sup.get('/api/admin/config')).data.config.economy
check('moderator PUT /config/economy → 403', (await mod.put('/api/admin/config/economy', econ0)).status === 403)
check('finance PUT /config/settings → 403', (await fin.put('/api/admin/config/settings', {})).status === 403)

// ── 2. User coin adjustment ──────────────────────────────────────────────
section('User coin adjustment')
const u1 = await mkUser({ coins: 100 })
let r = await sup.post(`/api/admin/users/${u1._id}/coins`, { delta: 500, reason: 'Goodwill credit' })
check('credit 500 → balance 600', r.status === 200 && r.data.balance === 600, r.data)
r = await fin.post(`/api/admin/users/${u1._id}/coins`, { delta: -250, reason: 'Chargeback' })
check('debit 250 (finance) → balance 350', r.status === 200 && r.data.balance === 350, r.data)
r = await sup.post(`/api/admin/users/${u1._id}/coins`, { delta: -10000, reason: 'Too much' })
check('debit beyond balance → 402 insufficient_coins', r.status === 402 && r.data.error.code === 'insufficient_coins', r.data)
const txns = await CoinTxn.find({ user: u1._id, type: 'admin_adjust' }).sort({ createdAt: 1 }).lean()
check('ledger has 2 admin_adjust rows (+500, −250) with running balances', txns.length === 2 && txns[0].coins === 500 && txns[0].balance === 600 && txns[1].coins === -250 && txns[1].balance === 350, txns)
check('user doc coins = 350', (await User.findById(u1._id).lean()).coins === 350)
r = await sup.get(`/api/admin/users/${u1._id}`)
check('user detail returns coinTxns', r.status === 200 && r.data.coinTxns.length >= 2, r.data)
check('audit has the coin adjustment', !!(await AuditLog.exists({ target: String(u1._id), action: /Added 500 coins/ })))
r = await sup.post(`/api/admin/users/${u1._id}/status`, { status: 'suspended', reason: 'Spam', days: 3 })
check('suspend 3 days sets suspendedUntil', r.status === 200 && new Date(r.data.suspendedUntil) > new Date(Date.now() + 2.9 * 86400000), r.data)
check('suspended user gets 403 from the app', (await userApi(u1).get('/api/reports/support')).status === 403)
r = await sup.post('/api/admin/users/bulk-status', { ids: [String(u1._id)], status: 'active' })
check('bulk reactivate', r.status === 200 && r.data.updated === 1 && (await User.findById(u1._id).lean()).status === 'active', r.data)

// ── 3. Host earnings adjustment ──────────────────────────────────────────
section('Host earnings adjustment')
const host = await User.findOne({ phone: '9000000001' }).lean()
const hostBal = async () => (await sup.get(`/api/admin/hosts/${host._id}`)).data.balance
const b0 = await hostBal()
r = await fin.post(`/api/admin/hosts/${host._id}/earnings`, { amount: 1000, reason: 'Billing correction' })
check('credit ₹1000 → available +1000', r.status === 200 && Math.abs(r.data.balance.available - (b0.available + 1000)) < 0.01, { b0, r: r.data })
r = await fin.post(`/api/admin/hosts/${host._id}/earnings`, { amount: -(b0.available + 5000), reason: 'Too much' })
check('debit beyond available → 400', r.status === 400, r.data)
r = await fin.post(`/api/admin/hosts/${host._id}/earnings`, { amount: -100, reason: 'Duplicate bonus' })
check('debit ₹100 → available +900 overall', r.status === 200 && Math.abs(r.data.balance.available - (b0.available + 900)) < 0.01, r.data)
r = await sup.get(`/api/admin/hosts?q=${encodeURIComponent(host.host.displayName)}`)
const row = r.data.items?.find(h => h.id === String(host._id))
check('host list shows the same available balance', row && Math.abs(row.available - (b0.available + 900)) < 0.01, row)
r = await sup.patch(`/api/admin/hosts/${host._id}`, { rates: { video: 35 } })
check('rate not in rateTiers → 400', r.status === 400, r.data)
r = await sup.patch(`/api/admin/hosts/${host._id}`, { rates: { video: 300 } })
check('rate above level maxRate → 400', r.status === 400, r.data)
r = await sup.patch(`/api/admin/hosts/${host._id}`, { rates: { video: 60, voice: 30 } })
check('valid rates saved', r.status === 200 && r.data.host.rates.video === 60, r.data)
r = await sup.post(`/api/admin/hosts/${host._id}/force-offline`, {})
check('force offline', r.status === 200 && (await User.findById(host._id).lean()).host.online === false)

// ── 4. Withdrawal lifecycle ──────────────────────────────────────────────
section('Withdrawal lifecycle')
const mkWd = amount => Withdrawal.create({ host: host._id, amount, fee: amount * 0.02, net: amount * 0.98, method: { kind: 'upi', label: 'UPI', holder: 'Aanya', upi: 'aanya@upi' } })
const before = await hostBal()
const w1 = await mkWd(300)
let bal = await hostBal()
check('requested withdrawal reduces available by 300', Math.abs(bal.available - (before.available - 300)) < 0.01 && bal.pendingPayout >= 300, { before, bal })
check('moderator cannot approve → 403', (await mod.post(`/api/admin/finance/withdrawals/${w1._id}/approve`)).status === 403)
r = await fin.post(`/api/admin/finance/withdrawals/${w1._id}/approve`)
check('approve → processing', r.status === 200 && r.data.withdrawal.status === 'processing', r.data)
check('approve again → 409', (await fin.post(`/api/admin/finance/withdrawals/${w1._id}/approve`)).status === 409)
check('paid without UTR → 400', (await fin.post(`/api/admin/finance/withdrawals/${w1._id}/paid`, {})).status === 400)
r = await fin.post(`/api/admin/finance/withdrawals/${w1._id}/paid`, { utr: `UTR${TAG}` })
check('paid → paid with paidAt', r.status === 200 && r.data.withdrawal.status === 'paid' && r.data.withdrawal.paidAt, r.data)
bal = await hostBal()
check('paid withdrawal stays deducted', Math.abs(bal.available - (before.available - 300)) < 0.01, bal)
const w2 = await mkWd(200)
const w3 = await mkWd(150)
const mid = await hostBal()
r = await fin.post('/api/admin/finance/withdrawals/bulk-approve', { ids: [String(w2._id), String(w3._id), String(w1._id)] })
check('bulk approve: 2 approved, 1 skipped', r.status === 200 && r.data.approved === 2 && r.data.skipped === 1, r.data)
r = await fin.post(`/api/admin/finance/withdrawals/${w2._id}/reject`, { reason: 'Name mismatch on UPI' })
check('reject processing withdrawal', r.status === 200 && r.data.withdrawal.status === 'rejected', r.data)
check('reject returns the 200 to available', Math.abs(r.data.balance.available - (mid.available + 200)) < 0.01, { mid, after: r.data.balance })
r = await fin.get('/api/admin/finance/withdrawals?status=processing')
check('withdrawal list has tabs totals', r.status === 200 && r.data.totals?.paid?.count >= 1, r.data.totals)
await fin.post(`/api/admin/finance/withdrawals/${w3._id}/reject`, { reason: 'Test cleanup' })

// ── 5. Call refund, payments ─────────────────────────────────────────────
section('Call refund & payments')
await import('../src/modules/calls/call.model.js').catch(() => null)
const Call = mongoose.models.Call
if (Call) {
  const caller = await mkUser({ coins: 0 })
  const c = await Call.create({ caller: caller._id, host: host._id, type: 'video', rate: 60, status: 'ended', connectedAt: new Date(Date.now() - 120000), endedAt: new Date(), duration: 120, minutes: 2, chargedCoins: 120 })
  await recordEarning(host._id, { source: 'video', coins: 120, from: caller._id, minutes: 2, ref: { kind: 'Call', id: c._id } })
  const hb = await hostBal()
  r = await sp.post(`/api/admin/calls/${c._id}/refund`, { reason: 'Video froze' })
  check('support refunds call → 120 coins back', r.status === 200 && r.data.coins === 120 && r.data.balance === 120 && r.data.reversedEarnings === 1, r.data)
  check('refund CoinTxn type=refund', !!(await CoinTxn.exists({ user: caller._id, type: 'refund', coins: 120 })))
  check('call earning reversed', (await Earning.findOne({ 'ref.id': c._id }).lean()).status === 'reversed')
  const hb2 = await hostBal()
  check('host lifetime drops by the reversed net', hb2.lifetime < hb.lifetime, { hb, hb2 })
  check('second refund → 409', (await sp.post(`/api/admin/calls/${c._id}/refund`, { reason: 'again' })).status === 409)
  check('still exactly one refund CoinTxn', (await CoinTxn.countDocuments({ user: caller._id, type: 'refund' })) === 1)
  check('flag call', (await sp.post(`/api/admin/calls/${c._id}/flag`, { note: 'Check recording' })).data?.flagged === true)
  r = await sp.get('/api/admin/calls?tab=flagged&limit=100')
  check('flagged tab only has flagged calls', r.status === 200 && r.data.items.length >= 1 && r.data.items.every(x => x.flagged), r.data.items?.length)
  r = await sp.get(`/api/admin/calls?tab=completed&q=${encodeURIComponent(caller.name)}`)
  check('calls list finds it as completed+refunded', r.status === 200 && r.data.items[0]?.refunded === true && r.data.items[0]?.status === 'completed', r.data.items?.[0])
} else check('Call model loaded (calls module)', false, 'mongoose.models.Call missing')

const payer = await mkUser({ coins: 0 })
const pay = await Payment.create({ user: payer._id, packId: 'p2', coins: 500, bonus: 50, amount: 449, method: 'upi', status: 'created' })
r = await fin.post(`/api/admin/finance/transactions/${pay._id}/success`)
check('mark pending payment success credits 550', r.status === 200 && r.data.balance === 550, r.data)
check('mark success again → 409 (idempotent)', (await fin.post(`/api/admin/finance/transactions/${pay._id}/success`)).status === 409)
check('exactly one purchase CoinTxn', (await CoinTxn.countDocuments({ user: payer._id, type: 'purchase' })) === 1)
await sup.post(`/api/admin/users/${payer._id}/coins`, { delta: -400, reason: 'Spent (test)' })
r = await fin.post(`/api/admin/finance/transactions/${pay._id}/refund`, { reason: 'Duplicate charge' })
check('refund deducts only what is left (150 of 550), never below 0', r.status === 200 && r.data.deductedCoins === 150 && r.data.balance === 0, r.data)
check('payment stored refundedCoins=150', (await Payment.findById(pay._id).lean()).refundedCoins === 150)

// ── 6. Config update validated + audited ─────────────────────────────────
section('Config')
r = await fin.put('/api/admin/config/economy', { ...econ0, commission: { ...econ0.commission, video: 95 } })
check('commission 95% → 400', r.status === 400, r.data)
r = await fin.put('/api/admin/config/economy', { ...econ0, messageCost: econ0.messageCost + 1 })
check('finance updates economy.messageCost', r.status === 200 && r.data.value.messageCost === econ0.messageCost + 1, r.data)
check('change listed in diff', r.data?.changes?.some(c => c.startsWith('messageCost:')), r.data?.changes)
const aud = await AuditLog.findOne({ target: 'economy' }).sort({ createdAt: -1 }).lean()
check('audit entry "Updated economy: messageCost: …"', aud?.action.includes(`messageCost: ${econ0.messageCost} → ${econ0.messageCost + 1}`) && aud.adminName === 'Neha Gupta', aud)
check('public /api/config reflects it', (await call('GET', '/api/config')).data.economy.messageCost === econ0.messageCost + 1)
await fin.put('/api/admin/config/economy', econ0)
const cfg = (await sup.get('/api/admin/config')).data.config
r = await fin.put('/api/admin/config/hostLevels', cfg.hostLevels.map((l, i) => (i === 2 ? { ...l, giftCoins: 100 } : l)))
check('hostLevels gift coins not increasing → 400', r.status === 400, r.data)
r = await fin.put('/api/admin/config/hostCategories', cfg.hostCategories.map((c, i) => (i === 1 ? { ...c, maxRate: 90 } : c)))
check('edit a host category', r.status === 200, r.data)
r = await fin.get('/api/admin/config')
check('levels pick up the category price cap', r.data.config.hostLevels.find(l => l.level === 11)?.maxRate === 90, r.data.config.hostLevels[10])
await fin.put('/api/admin/config/hostCategories', cfg.hostCategories)
r = await fin.put('/api/admin/config/rateTiers', { ...cfg.rateTiers, video: [40, 30, 60] })
check('rateTiers unsorted → 400', r.status === 400, r.data)
r = await fin.put('/api/admin/config/coinPacks', [...cfg.coinPacks, { ...cfg.coinPacks[0] }])
check('coinPacks duplicate id → 400', r.status === 400, r.data)
r = await sup.put('/api/admin/config/settings', { ...cfg.settings, otp: { ...cfg.settings.otp, length: 12 } })
check('settings bad otp length → 400', r.status === 400, r.data)

// ── 7. Reports + auto-suspend ────────────────────────────────────────────
section('Reports & auto-suspend')
await sup.put('/api/admin/config/settings', { ...cfg.settings, moderation: { ...cfg.settings.moderation, maxReportsBeforeAutoSuspend: 3 } })
const target = await mkUser()
const reporters = [await mkUser(), await mkUser(), await mkUser()]
r = await userApi(reporters[0]).post('/api/reports', { targetType: 'user', targetId: String(target._id), reason: 'Nudity or sexual content' })
check('report created with priority high', r.status === 201 && r.data.report.priority === 'high' && !r.data.autoSuspended, r.data)
check('duplicate open report → 409', (await userApi(reporters[0]).post('/api/reports', { targetType: 'user', targetId: String(target._id), reason: 'Spam' })).status === 409)
r = await userApi(reporters[1]).post('/api/reports', { targetType: 'user', targetId: String(target._id), reason: 'Asking for contact details / payments outside app' })
check('contact/payment → medium', r.data?.report?.priority === 'medium', r.data)
r = await userApi(reporters[2]).post('/api/reports', { targetType: 'user', targetId: String(target._id), reason: 'Spam' })
check('3rd open report → autoSuspended', r.status === 201 && r.data.report.priority === 'low' && r.data.autoSuspended === true, r.data)
check('target is suspended', (await User.findById(target._id).lean()).status === 'suspended')
check('audit by System', !!(await AuditLog.exists({ target: String(target._id), adminName: 'System', action: /Auto-suspended/ })))
r = await mod.get(`/api/admin/reports?status=open&target=${target._id}`)
check('open queue sorted high → low', r.status === 200 && r.data.items.map(x => x.priority).join() === 'high,medium,low', r.data.items?.map(x => x.priority))
const lowId = r.data.items?.[2]?.id
r = await mod.post(`/api/admin/reports/${lowId}/resolve`, { action: 'dismiss', note: 'Not spam' })
check('dismiss sets status + handledBy', r.status === 200 && r.data.report.status === 'dismissed' && r.data.report.handledBy === 'Priya Nair', r.data)
check('resolve again → 409', (await mod.post(`/api/admin/reports/${lowId}/resolve`, { action: 'ban' })).status === 409)
const highId = (await mod.get(`/api/admin/reports?status=open&target=${target._id}`)).data.items[0].id
r = await sp.post(`/api/admin/reports/${highId}/resolve`, { action: 'ban', note: 'Explicit content' })
check('ban via report (support role)', r.status === 200 && r.data.report.status === 'resolved' && (await User.findById(target._id).lean()).status === 'banned', r.data)
await sup.put('/api/admin/config/settings', cfg.settings)

// Support tickets
const tu = reporters[0]
r = await userApi(tu).post('/api/reports/support', { subject: 'Coins not added', category: 'Payments', message: 'Paid ₹449 but no coins' })
check('user opens a ticket', r.status === 201 && r.data.ticket.status === 'open' && r.data.ticket.priority === 'high', r.data)
const tid = r.data.ticket.id
r = await sp.post(`/api/admin/support/${tid}/reply`, { text: 'Looking into it' })
check('admin reply → pending, auto-assigned', r.status === 200 && r.data.ticket.status === 'pending' && r.data.ticket.assignee === 'Rohit Das', r.data)
r = await userApi(tu).post(`/api/reports/support/${tid}/messages`, { text: 'Thanks' })
check('user reply → open, 3 messages', r.status === 200 && r.data.ticket.status === 'open' && r.data.ticket.messages.length === 3, r.data)
check('close', (await sp.post(`/api/admin/support/${tid}/close`)).data?.ticket?.status === 'closed')
check('reopen', (await sp.post(`/api/admin/support/${tid}/reopen`)).data?.ticket?.status === 'open')
r = await userApi(tu).get('/api/reports/support')
check('user lists own tickets', r.status === 200 && r.data.items.length === 1, r.data)

// ── 8. Agencies & content ────────────────────────────────────────────────
section('Agencies & content')
check('agency bad code → 400', (await mod.post('/api/admin/agencies', { name: 'Bad', code: 'ab!' })).status === 400)
const code = `T${TAG}`
r = await mod.post('/api/admin/agencies', { name: 'Test Agency', code: code.toLowerCase(), city: 'Pune' })
check('agency created, code uppercased', r.status === 201 && r.data.agency.code === code && r.data.agency.hosts === 0, r.data)
check('duplicate code → 409', (await mod.post('/api/admin/agencies', { name: 'Dup', code })).status === 409)
const agId = r.data.agency.id
check('suspend agency', (await mod.post(`/api/admin/agencies/${agId}/status`, { status: 'suspended', reason: 'Test' })).data?.agency?.status === 'suspended')
check('delete agency', (await mod.del(`/api/admin/agencies/${agId}`)).status === 200)
r = await mod.post('/api/admin/content/banners', { title: 'Diwali', placement: 'Home', startsAt: new Date(Date.now() - 86400000), endsAt: new Date(Date.now() + 86400000), link: 'rebu://events' })
check('banner created as live', r.status === 201 && r.data.banner.status === 'live', r.data)
await mod.del(`/api/admin/content/banners/${r.data.banner.id}`)
r = await mod.post('/api/admin/content/notifications', { title: 'Hi', body: 'Hello', audience: 'All users', sendNow: true })
check('push sendNow → sent with audienceCount', r.status === 201 && r.data.notification.status === 'sent' && r.data.notification.audienceCount >= 1, r.data)
r = await mod.post('/api/admin/content/pages', { slug: `terms-${TAG}`, title: 'Terms', body: 'Be nice' })
check('page created', r.status === 201, r.data)
await mod.del(`/api/admin/content/pages/${r.data.page.id}`)

// ── 9. Admin management guards ───────────────────────────────────────────
section('Admin management')
check('super cannot demote self → 403', (await sup.patch(`/api/admin/admins/${supId}`, { role: 'moderator' })).status === 403)
check('super cannot disable self → 403', (await sup.post(`/api/admin/admins/${supId}/status`, { status: 'disabled' })).status === 403)
check('super cannot remove self → 403', (await sup.del(`/api/admin/admins/${supId}`)).status === 403)
const email = `temp${TAG}@rebu.app`
r = await sup.post('/api/admin/admins', { name: 'Temp Admin', email, role: 'support' })
check('invite returns temp password once', r.status === 201 && r.data.tempPassword?.length >= 10 && !r.data.admin.passwordHash, r.data)
const tmpId = r.data.admin.id
const tmp = await login(email, r.data.tempPassword)
check('invited admin can sign in (support → /support 200)', (await tmp.get('/api/admin/support')).status === 200)
check('duplicate invite → 409', (await sup.post('/api/admin/admins', { name: 'Dup', email, role: 'support' })).status === 409)
check('change role → super_admin', (await sup.patch(`/api/admin/admins/${tmpId}`, { role: 'super_admin' })).data?.admin?.role === 'super_admin')
check('new super can reach /admins', (await tmp.get('/api/admin/admins')).status === 200)
check('disable', (await sup.post(`/api/admin/admins/${tmpId}/status`, { status: 'disabled' })).data?.admin?.status === 'disabled')
check('disabled admin token → 401', (await tmp.get('/api/admin/admins')).status === 401)
check('enable', (await sup.post(`/api/admin/admins/${tmpId}/status`, { status: 'active' })).data?.admin?.status === 'active')
// The new super may demote the seeded one (one active super remains)… then restore.
check('other super can demote seeded super while one remains', (await tmp.patch(`/api/admin/admins/${supId}`, { role: 'moderator' })).status === 200)
check('demoted admin loses /admins → 403', (await sup.get('/api/admin/admins')).status === 403)
check('restore seeded super', (await tmp.patch(`/api/admin/admins/${supId}`, { role: 'super_admin' })).status === 200)
check('remove other admin', (await sup.del(`/api/admin/admins/${tmpId}`)).status === 200)
check('removed admin token → 401', (await tmp.get('/api/admin/admins')).status === 401)
check('at least one active super_admin remains', (await Admin.countDocuments({ role: 'super_admin', status: 'active' })) >= 1)
r = await sup.get('/api/admin/audit?admin=Om%20Parteki&days=1')
check('audit filter by admin + date', r.status === 200 && r.data.items.length > 0 && r.data.items.every(x => x.admin === 'Om Parteki'), r.data.items?.slice(0, 2))
check('every audit row today has an action', !(await AuditLog.exists({ createdAt: { $gte: new Date(Date.now() - 3600000) }, action: { $in: [null, ''] } })))

// Hosting is women-only: an application from a man can't be approved.
const { HostApplication } = await import('../src/modules/hosts/hosts.models.js')
const maleApp = await HostApplication.create({
  user: u1._id, name: 'Test Applicant', gender: 'Male', dob: new Date('1998-01-01'),
  languages: ['Hindi'], photos: ['https://i.pravatar.cc/800?img=3'], rates: { video: 40, voice: 20 }, status: 'pending',
})
r = await sup.post(`/api/admin/applications/${maleApp._id}/approve`)
check('male application can’t be approved (women only) → 400', r.status === 400, r.data)
check('…and it stays pending', (await HostApplication.findById(maleApp._id)).status === 'pending')
await HostApplication.deleteOne({ _id: maleApp._id })

console.log(`\n${pass} passed, ${fails.length} failed`)
if (fails.length) console.log('Failed:\n - ' + fails.join('\n - '))
await disconnectDb()
process.exit(fails.length ? 1 : 0)
