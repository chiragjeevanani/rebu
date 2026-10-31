// End-to-end checks for wallet / hosts / host routes on :4101 (db rebu_t1).
import { connectDb, disconnectDb } from 'file:///D:/Appzeto-3/Rebu/backend/src/config/db.js'
import { loadConfig } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/config/config.service.js'
import { Agency, HostApplication } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/hosts/hosts.models.js'
import { User } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/users/user.model.js'
import { approveApplication, rejectApplication } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/hosts/hosts.service.js'
import { chargeUserPayHost } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/wallet/economy.service.js'

// Never run against the dev database by accident: these tests spend coins.
if (/\/rebu(\?|$)/.test(process.env.MONGO_URI || '') && !process.env.FORCE) {
  console.error('Refusing to run against the dev database (rebu). Use npm test, or set FORCE=1.')
  process.exit(1)
}

const B = (process.env.API || 'http://127.0.0.1:4101') + '/api'
let fails = 0
const ok = (cond, msg, extra) => {
  if (!cond) fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra !== undefined && !cond ? ' → ' + JSON.stringify(extra) : ''}`)
}
async function call(method, path, token, body) {
  const r = await fetch(B + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function login(phone, code) {
  const s = await call('POST', '/auth/otp/send', null, { phone })
  const v = await call('POST', '/auth/otp/verify', null, { phone, code: code || s.body.devCode })
  return v.body
}

await connectDb()
await loadConfig()

// Fresh state for the applicant and agencies.
const APPLICANT = '9123400001'
const old = await User.findOne({ phone: APPLICANT })
if (old) {
  await HostApplication.deleteMany({ user: old._id })
  await User.deleteOne({ _id: old._id })
}
await Agency.deleteMany({ code: { $in: ['STAR1048', 'BADCO'] } })
await Agency.create({ name: 'Star Talent', code: 'STAR1048' })
await Agency.create({ name: 'Bad Co', code: 'BADCO', status: 'suspended' })

// ---- Wallet -----------------------------------------------------------------
const demo = await login('9999999999', '123456')
const T = demo.token
const startCoins = demo.user.coins
let r = await call('GET', '/wallet/packs', T)
ok(r.status === 200 && Array.isArray(r.body.packs), 'GET /wallet/packs')
const hadPaid = !r.body.packs.some(p => p.firstRecharge)
console.log('      first-recharge pack visible:', !hadPaid)

r = await call('POST', '/wallet/orders', T, { packId: 'p2' })
ok(r.status === 201 && r.body.order.status === 'created' && r.body.order.gateway === 'mock', 'POST /wallet/orders creates mock order', r.body)
const orderId = r.body.order.id
r = await call('POST', '/wallet/orders', T, { packId: 'nope' })
ok(r.status === 400, 'unknown pack → 400')

// Double confirm concurrently + sequentially; must credit exactly once.
const [c1, c2] = await Promise.all([
  call('POST', `/wallet/orders/${orderId}/confirm`, T, { result: 'success', method: 'UPI' }),
  call('POST', `/wallet/orders/${orderId}/confirm`, T, { result: 'success', method: 'UPI' }),
])
const c3 = await call('POST', `/wallet/orders/${orderId}/confirm`, T, { result: 'success' })
const applied = [c1, c2, c3].filter(x => x.body?.applied).length
ok(applied === 1, 'confirm is idempotent (exactly one applied out of 3)', [c1.body, c2.body, c3.body])
const me1 = (await call('GET', '/me', T)).body.user
ok(me1.coins === startCoins + 550, `coins credited once (+550): ${startCoins} → ${me1.coins}`)
r = await call('POST', `/wallet/orders/${orderId}/confirm`, T, { result: 'failed' })
ok(r.body.order.status === 'success' && !r.body.applied, 'failing a paid order does nothing')

r = await call('GET', '/wallet/packs', T)
ok(!r.body.packs.some(p => p.firstRecharge), 'first-recharge pack hidden after a purchase')

r = await call('POST', '/wallet/orders', T, { packId: 'p1' })
r = await call('POST', `/wallet/orders/${r.body.order.id}/confirm`, T, { result: 'failed' })
ok(r.body.order.status === 'failed', 'failed confirm sets status failed')
r = await call('POST', `/wallet/orders/${r.body.order.id}/confirm`, T, { result: 'success' })
ok(!r.body.applied && r.body.order.status === 'failed', 'cannot succeed a failed order')

r = await call('POST', '/wallet/vip', T, { level: 2 })
ok(r.status === 201 && r.body.order.packId === 'vip2' && r.body.order.coins === 0, 'POST /wallet/vip creates order', r.body)
const coinsBeforeVip = (await call('GET', '/me', T)).body.user.coins
r = await call('POST', `/wallet/orders/${r.body.order.id}/confirm`, T, { result: 'success' })
const until1 = new Date(r.body.vip.until)
ok(r.body.applied && r.body.vip.level === 2 && r.body.balance === coinsBeforeVip, 'VIP confirm sets vip, no coins', r.body)
r = await call('POST', '/wallet/vip', T, { level: 2 })
r = await call('POST', `/wallet/orders/${r.body.order.id}/confirm`, T, { result: 'success' })
ok(Math.round((new Date(r.body.vip.until) - until1) / 864e5) === 30, 'second VIP purchase extends by 30 days')

r = await call('GET', '/wallet/orders?limit=2', T)
ok(r.status === 200 && r.body.items.length === 2 && r.body.total >= 4, 'GET /wallet/orders paged', r.body)
const me2 = (await call('GET', '/me', T)).body.user
ok(me2.spent >= 449 + 499 * 2, `user.spent updated (${me2.spent})`)

// ---- Browse hosts -----------------------------------------------------------
r = await call('GET', '/hosts?sort=rating', T)
ok(r.status === 200 && r.body.total === 6 && r.body.items[0].isHost && !('phone' in r.body.items[0]), 'GET /hosts', r.body)
const hostA = r.body.items.find(h => h.name === 'Aanya')
r = await call('GET', '/hosts?online=1', T)
ok(r.body.items.every(h => h.host.online), `online filter (${r.body.total})`)
r = await call('GET', '/hosts?q=pune', T)
ok(r.body.total === 1 && r.body.items[0].name === 'Meera', 'q filter by city')
r = await call('GET', '/hosts?sort=popular&limit=2&page=2', T)
ok(r.body.items.length === 2 && r.body.pages === 3, 'paging')
await call('POST', `/me/following/${hostA.id}`, T)
r = await call('GET', `/hosts/${hostA.id}`, T)
ok(r.status === 200 && r.body.following === true && r.body.host.name === 'Aanya', 'GET /hosts/:id with following')
await call('POST', `/me/blocked/${hostA.id}`, T)
r = await call('GET', `/hosts/${hostA.id}`, T)
ok(r.status === 404, 'blocked host is hidden (detail)')
r = await call('GET', '/hosts', T)
ok(r.body.total === 5, 'blocked host is hidden (list)')
await User.updateOne({ phone: '9999999999' }, { $set: { blocked: [] } })
r = await call('GET', '/hosts/notanid', T)
ok(r.status === 404, 'bad id → 404')

// ---- Apply as host ----------------------------------------------------------
const ap = await login(APPLICANT)
const A = ap.token
r = await call('GET', '/host/me', A)
ok(r.status === 403, 'non-host → 403 on /host/me')
const good = {
  name: 'Kavya Sharma',
  gender: 'Female',
  dob: '2000-02-02',
  languages: ['Hindi', 'English'],
  bio: 'Love music and movies',
  photos: ['https://i.pravatar.cc/800?img=20'],
  selfie: 'https://i.pravatar.cc/800?img=21',
  id: { type: 'Aadhaar', last4: '1234', photo: 'https://example.com/id.jpg' },
  agencyCode: 'star1048',
  rates: { video: 60, voice: 30 },
}
r = await call('POST', '/host/application', A, { ...good, rates: { video: 80, voice: 30 } })
ok(r.status === 400, 'rate above level-1 cap → 400', r.body)
r = await call('POST', '/host/application', A, { ...good, rates: { video: 45, voice: 30 } })
ok(r.status === 400, 'rate not a tier → 400')
r = await call('POST', '/host/application', A, { ...good, dob: '2015-01-01' })
ok(r.status === 400, 'under age → 400')
r = await call('POST', '/host/application', A, { ...good, id: { type: 'Voter', last4: '1234', photo: 'https://x.y/z' } })
ok(r.status === 400, 'unknown id type → 400')
r = await call('POST', '/host/application', A, { ...good, photos: [] })
ok(r.status === 400, 'no photos → 400')

// Hosting is women-only by default: the form's gender and the profile must both be Female.
r = await call('POST', '/host/application', A, { ...good, gender: 'Male' })
ok(r.status === 403 && r.body.error?.code === 'women_only', 'male applicant → 403 women_only', r.body)
await User.updateOne({ phone: APPLICANT }, { $set: { gender: 'Male' } })
r = await call('POST', '/host/application', A, good)
ok(r.status === 403 && r.body.error?.code === 'women_only', 'profile says male → 403 even if the form says Female', r.body)
await User.updateOne({ phone: APPLICANT }, { $set: { gender: null } })

// Flags: contact in bio, suspended agency, borderline age.
const borderline = new Date(Date.now() - 18.5 * 365.25 * 864e5).toISOString().slice(0, 10)
r = await call('POST', '/host/application', A, { ...good, bio: 'msg me on whatsapp 98765 43210', agencyCode: 'BADCO', dob: borderline })
ok(r.status === 201 && r.body.application.status === 'pending' && !('flags' in r.body.application), 'submit application (flags hidden from applicant)', r.body)
const app1 = await HostApplication.findById(r.body.application.id)
console.log('      flags:', app1.flags)
ok(app1.flags.includes('Contact details in bio') && app1.flags.includes('Agency is suspended') && app1.flags.includes('Age close to limit — check ID'), 'flags computed')
r = await call('POST', '/host/application', A, good)
ok(r.status === 409, 'second pending application → 409')
await rejectApplication(app1, ['Bio contains contact details'], 'Test Admin')
r = await call('GET', '/host/application', A)
ok(r.body.application.status === 'rejected' && r.body.application.reasons[0] === 'Bio contains contact details', 'GET application shows rejection + reasons')
r = await call('POST', '/host/application', A, { ...good, agencyCode: 'NOSUCH' })
const app2Flags = (await HostApplication.findById(r.body.application.id)).flags
ok(r.status === 201 && app2Flags.includes('Agency code not found'), 'resubmit after rejection; unknown agency flagged')
await HostApplication.deleteOne({ _id: r.body.application.id })
r = await call('POST', '/host/application', A, good)
ok(r.status === 201, 'resubmit clean application')
const app3 = await HostApplication.findById(r.body.application.id)
ok(app3.flags.length === 0, 'clean application has no flags', app3.flags)
await approveApplication(app3, 'Test Admin')
let threw = false
try { await approveApplication(app3, 'Test Admin') } catch (e) { threw = e.status === 409 }
ok(threw, 'approving twice → 409 (no double bonus)')
r = await call('GET', '/host/application', A)
ok(r.body.application.status === 'approved' && r.body.isHost, 'application approved')
r = await call('POST', '/host/application', A, good)
ok(r.status === 409, 'already a host → 409')

// ---- Host center ------------------------------------------------------------
r = await call('GET', '/host/me', A)
ok(r.status === 200 && r.body.level === 1 && r.body.agency?.code === 'STAR1048' && r.body.host.displayName === 'Kavya Sharma', 'GET /host/me', r.body)
ok(r.body.today.bySource.bonus === 800 && r.body.balance.available === 800, `welcome bonus 1000 coins = ₹800, not shared with the agency (${r.body.balance.available})`, r.body)
ok(r.body.next?.level === 2 && r.body.next.giftCoins > 0 && r.body.levels.length >= 10 && r.body.category?.key === 'iron', 'gift-level ladder + next + category', { next: r.body.next, category: r.body.category })
r = await call('PATCH', '/host/me', A, { rates: { video: 100 } })
ok(r.status === 400, 'PATCH rates above cap → 400')
r = await call('PATCH', '/host/me', A, { rates: { video: 40, voice: 15 }, online: true, bio: 'Hi there', languages: ['Tamil'] })
ok(r.status === 200 && r.body.host.rates.video === 40 && r.body.host.online && r.body.host.languages[0] === 'Tamil', 'PATCH /host/me')
// Price caps come from the category: Iron (levels 1–10) caps at 60, Gold (31+) at 150.
const riya = await login('9000000002')
r = await call('PATCH', '/host/me', riya.token, { rates: { video: 200 } })
ok(r.status === 400, 'Iron host can’t price at 200')
await User.updateOne({ phone: '9000000002' }, { $set: { 'host.levelOverride': 31 } })
r = await call('PATCH', '/host/me', riya.token, { rates: { video: 150 } })
ok(r.status === 200 && r.body.host.rates.video === 150, 'Gold host can price at 150', r.body)
await User.updateOne({ phone: '9000000002' }, { $set: { 'host.levelOverride': null } })
r = await call('PATCH', '/host/me', riya.token, { rates: { video: 40 } })

// Some paid activity: demo user pays Kavya for a 3-min call + chat.
const kavya = await User.findOne({ phone: APPLICANT })
const demoU = await User.findOne({ phone: '9999999999' })
const fakeCall = { kind: 'Call', id: new (await import('file:///D:/Appzeto-3/Rebu/backend/node_modules/mongoose/index.js')).default.Types.ObjectId() }
for (let i = 0; i < 3; i++) {
  await chargeUserPayHost({ userId: demoU._id, hostId: kavya._id, coins: 40, source: 'video', txnType: 'call', title: 'Video call', ref: fakeCall, minutes: 1, fromName: 'Arjun' })
}
await chargeUserPayHost({ userId: demoU._id, hostId: kavya._id, coins: 10, source: 'chat', title: 'Message', fromName: 'Arjun' })
r = await call('GET', '/host/me', A)
ok(r.body.today.calls === 1 && r.body.today.callMinutes === 3 && r.body.today.liveMinutes === 0, 'today: 1 call, 3 min (distinct by ref)', r.body.today)
console.log('      today:', JSON.stringify(r.body.today), 'balance:', JSON.stringify(r.body.balance))

// ---- Earnings ---------------------------------------------------------------
r = await call('GET', '/host/earnings?range=today', A)
ok(r.status === 200 && r.body.total === 5 && r.body.summary.bySource.video.count === 3 && r.body.summary.bySource.video.qty === 3, 'GET /host/earnings today', r.body.summary)
const s = r.body.summary
ok(Math.abs(s.gross - s.commission - s.agency - s.net) < 0.05, `summary adds up: gross ${s.gross} − comm ${s.commission} − agency ${s.agency} = net ${s.net}`)
r = await call('GET', '/host/earnings?range=all&source=video&limit=2', A)
ok(r.body.items.length === 2 && r.body.total === 3 && r.body.items.every(e => e.source === 'video'), 'source filter + paging')
r = await call('GET', '/host/earnings?range=bogus', A)
ok(r.status === 400, 'bad range → 400')
r = await call('GET', '/host/earnings/daily?days=7', A)
ok(r.body.days.length === 7 && r.body.days[6].ago === 0 && Math.abs(r.body.days[6].net - s.net) < 0.01, 'daily chart: today matches summary', r.body.days)
const chatE = (await call('GET', '/host/earnings?source=chat', A)).body.items[0]
r = await call('POST', `/host/earnings/${chatE.id}/report`, A, { reason: 'Amount looks wrong' })
ok(r.status === 201 && r.body.earning.status === 'review' && r.body.dispute.status === 'open', 'report earning → dispute + review')
r = await call('POST', `/host/earnings/${chatE.id}/report`, A, { reason: 'again' })
ok(r.status === 409, 'second report → 409')
r = await call('GET', '/host/me', A)
ok(r.body.balance.onHold === chatE.net, `reported earning on hold (₹${r.body.balance.onHold})`)

// ---- Payout methods ---------------------------------------------------------
r = await call('POST', '/host/payout-methods', A, { kind: 'upi', upi: 'bad upi' })
ok(r.status === 400, 'invalid UPI → 400')
r = await call('POST', '/host/payout-methods', A, { kind: 'bank', account: '1234', ifsc: 'HDFC0001234' })
ok(r.status === 400, 'short account → 400')
r = await call('POST', '/host/payout-methods', A, { kind: 'bank', account: '123456789012', ifsc: 'HDFC1001234' })
ok(r.status === 400, 'bad IFSC → 400')
r = await call('POST', '/host/payout-methods', A, { kind: 'upi', upi: 'kavya@okhdfc' })
ok(r.status === 201 && r.body.method.holder === 'Kavya Sharma', 'add UPI (holder = verified name)')
const upiId = r.body.method.id
r = await call('POST', '/host/payout-methods', A, { kind: 'bank', account: '123456789012', ifsc: 'hdfc0001234' })
ok(r.status === 201 && r.body.method.account === '••9012' && r.body.method.ifsc === 'HDFC0001234', 'add bank (masked)', r.body)
const bankId = r.body.method.id
r = await call('POST', '/host/payout-methods', A, { kind: 'upi', upi: 'kavya@okhdfc' })
ok(r.status === 409, 'duplicate method → 409')
r = await call('GET', '/host/payout-methods', A)
ok(r.body.items.length === 2 && !JSON.stringify(r.body).includes('123456789012'), 'GET payout methods never leaks full account')

// ---- Withdrawals ------------------------------------------------------------
const bal0 = (await call('GET', '/host/withdrawals', A)).body.balance
console.log('      available before withdraw:', bal0.available)
r = await call('POST', '/host/withdrawals', A, { amount: 100, methodId: upiId })
ok(r.status === 400, 'below minWithdraw → 400')
r = await call('POST', '/host/withdrawals', A, { amount: bal0.available + 1, methodId: upiId })
ok(r.status === 400, 'overdraw → 400', r.body)
// Two concurrent withdrawals that only fit once.
const amt = Math.floor(bal0.available * 0.7)
const [w1, w2] = await Promise.all([
  call('POST', '/host/withdrawals', A, { amount: amt, methodId: bankId }),
  call('POST', '/host/withdrawals', A, { amount: amt, methodId: bankId }),
])
ok([w1, w2].filter(x => x.status === 201).length === 1 && [w1, w2].some(x => x.status === 400), `concurrent withdrawals: only one of 2×₹${amt} succeeds`, [w1.status, w2.status, w1.body, w2.body])
const wOk = [w1, w2].find(x => x.status === 201).body
ok(wOk.withdrawal.fee === Math.round(amt * 2) / 100 && wOk.withdrawal.net === amt - wOk.withdrawal.fee && wOk.withdrawal.method.account === '••9012', 'fee 2%, net, masked snapshot', wOk.withdrawal)
r = await call('GET', '/host/withdrawals', A)
ok(r.body.total === 1 && r.body.balance.pendingPayout === amt, 'GET /host/withdrawals')
// Daily cap: a ₹49,900 payout already today + ₹50,000 adjustment so balance isn't the limit.
const { adjustEarnings } = await import('file:///D:/Appzeto-3/Rebu/backend/src/modules/wallet/economy.service.js')
const { Withdrawal } = await import('file:///D:/Appzeto-3/Rebu/backend/src/modules/earnings/earnings.models.js')
await Withdrawal.create({ host: kavya._id, amount: 49900, fee: 0, net: 49900, status: 'paid' })
await adjustEarnings(kavya._id, 51000, 'test top-up')
r = await call('POST', '/host/withdrawals', A, { amount: 500, methodId: upiId })
ok(r.status === 400 && /a day/.test(r.body.error.message), 'daily cap → 400', r.body)
r = await call('DELETE', `/host/payout-methods/${upiId}`, A)
ok(r.status === 200, 'DELETE payout method')
r = await call('DELETE', `/host/payout-methods/${upiId}`, A)
ok(r.status === 404, 'DELETE again → 404')

// ---- Agency -----------------------------------------------------------------
r = await call('POST', '/host/agency', A, { code: 'STAR1048' })
ok(r.status === 409, 'join same agency → 409')
r = await call('DELETE', '/host/agency', A)
ok(r.status === 200 && r.body.agency === null, 'leave agency')
r = await call('POST', '/host/agency', A, { code: 'BADCO' })
ok(r.status === 400, 'join suspended agency → 400')
r = await call('POST', '/host/agency', A, { code: 'star1048' })
ok(r.status === 200 && r.body.agency.code === 'STAR1048', 'join active agency')

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
await disconnectDb()
process.exit(fails ? 1 : 0)
