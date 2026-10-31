// Admin controls over the coin economy, end to end (own server + db, see test-all.js):
//  - coin value: how many ₹ a coin is worth to hosts (coin → rupee redemption)
//  - coin packs: how many coins a buyer gets for what price
//  - diamonds → coins rate, minimum withdrawal, max gifts per send
import { connectDb, disconnectDb } from 'file:///D:/Appzeto-3/Rebu/backend/src/config/db.js'
import { loadConfig } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/config/config.service.js'
import { User } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/users/user.model.js'
import { Earning } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/earnings/earnings.models.js'
import { AuditLog } from 'file:///D:/Appzeto-3/Rebu/backend/src/modules/audit/audit.model.js'

if (/\/rebu(\?|$)/.test(process.env.MONGO_URI || '') && !process.env.FORCE) {
  console.error('Refusing to run against the dev database (rebu).')
  process.exit(1)
}

const B = (process.env.API || 'http://127.0.0.1:4206') + '/api'
let fails = 0
let passed = 0
const ok = (cond, msg, extra) => {
  cond ? passed++ : fails++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}${extra !== undefined && !cond ? ' → ' + JSON.stringify(extra) : ''}`)
}
const section = t => console.log(`\n${t}`)
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
const near = (a, b, eps = 0.011) => Math.abs(a - b) <= eps
const round2 = n => Math.round(n * 100) / 100

await connectDb()
await loadConfig()

const admin = (await call('POST', '/auth/admin/login', null, { email: 'admin@rebu.app', password: 'admin123' })).body.token
const A = path => ({ get: () => call('GET', path, admin), put: body => call('PUT', path, admin, body) })
const cfg = async () => (await call('GET', '/admin/config', admin)).body.config
const pub = async () => (await call('GET', '/config')).body
const putCfg = (key, value) => call('PUT', `/admin/config/${key}`, admin, value)

const buyer = await login('9999999999', '123456')
const T = buyer.token
const host = await login('9000000001') // Aanya (seeded host)
const H = host.token
const hostId = host.user.id || host.user._id
await User.updateOne({ phone: '9999999999' }, { $set: { coins: 100000 } })
const orig = await cfg()
const sendGift = (key, quantity = 1) => call('POST', '/gifts', T, { toId: hostId, giftKey: key, quantity, context: { type: 'chat' } })
const lastEarning = () => Earning.findOne({ host: hostId, source: 'gift' }).sort({ createdAt: -1 }).lean()

// ─────────────────────────────────────────────────────────────────────────────
section('Coin value: how many rupees a coin is worth')
let r = await putCfg('economy', { ...orig.economy, coinInr: 0 })
ok(r.status === 400, 'coin value 0 is refused', r.body)
r = await putCfg('economy', { ...orig.economy, coinInr: -1 })
ok(r.status === 400, 'negative coin value is refused')
r = await putCfg('economy', { ...orig.economy, coinInr: 101 })
ok(r.status === 400, 'coin value above ₹100 is refused')
r = await putCfg('economy', { ...orig.economy, coinInr: 'abc' })
ok(r.status === 400, 'non-numeric coin value is refused')
ok((await cfg()).economy.coinInr === orig.economy.coinInr, 'refused edits leave the value untouched')

r = await putCfg('economy', { ...orig.economy, coinInr: 0.8 })
ok(r.status === 200, 'set coin value ₹0.80 (100 coins = ₹80)')
let g = await sendGift('rose', 10)
ok(g.status === 201, '10 roses = 100 coins sent', g.body)
const e1 = await lastEarning()
ok(near(e1.gross, 80) && e1.coins === 100, `at ₹0.80 per coin, 100 coins settle at gross ₹80 (got ${e1.gross})`, e1)

r = await putCfg('economy', { ...orig.economy, coinInr: 0.5 })
ok(r.status === 200 && r.body.value.coinInr === 0.5, 'admin lowers coin value to ₹0.50')
ok((await pub()).economy.coinInr === 0.5, 'the app config shows ₹0.50 straight away')
g = await sendGift('rose', 10)
const e2 = await lastEarning()
ok(near(e2.gross, 50), `now the same 100 coins settle at gross ₹50 (got ${e2.gross})`, e2)
ok(near(e2.net / e1.net, 0.5 / 0.8, 0.02), 'host net moves in the same proportion as the coin value')
const e1again = await Earning.findById(e1._id).lean()
ok(near(e1again.gross, 80) && near(e1again.net, e1.net), 'earlier earnings keep the value they were earned at')

r = await putCfg('economy', { ...orig.economy, coinInr: 1.25 })
g = await sendGift('rose', 10)
const e3 = await lastEarning()
ok(near(e3.gross, 125), `raised to ₹1.25 → 100 coins settle at gross ₹125 (got ${e3.gross})`, e3)
const bal = (await call('GET', '/host/withdrawals', H)).body.balance
ok(near(bal.lifetime - 0, bal.lifetime) && bal.lifetime >= round2(e1.net + e2.net + e3.net) - 0.05, 'host balance is the sum of what each earning was worth', bal)
const audit = await AuditLog.findOne({ target: 'economy' }).sort({ createdAt: -1 }).lean()
ok(/coinInr: 0\.5 → 1\.25/.test(audit?.action || ''), 'audit log records "coinInr: 0.5 → 1.25"', audit?.action)
await putCfg('economy', { ...orig.economy })

// ─────────────────────────────────────────────────────────────────────────────
section('Minimum withdrawal')
r = await putCfg('economy', { ...orig.economy, minWithdraw: 5000 })
ok(r.status === 200 && (await pub()).economy.minWithdraw === 5000, 'admin raises the minimum withdrawal to ₹5,000 (app sees it)')
const pm = await call('POST', '/host/payout-methods', H, { kind: 'upi', upi: 'econtest@okaxis' })
const methodId = pm.body.method?.id || (await call('GET', '/host/payout-methods', H)).body.items?.[0]?.id
r = await call('POST', '/host/withdrawals', H, { amount: 500, methodId })
ok(r.status === 400 && /5000/.test(r.body?.error?.message || ''), 'withdrawing ₹500 now fails with the new minimum', r.body)
await putCfg('economy', { ...orig.economy })

// ─────────────────────────────────────────────────────────────────────────────
section('Coin packs: how many coins a buyer gets for what amount')
r = await call('GET', '/wallet/packs', T)
const p2 = r.body.packs.find(p => p.id === 'p2')
ok(p2 && p2.coins === 500 && p2.bonus === 50 && p2.price === 449, 'default pack p2 = 500 coins + 50 bonus for ₹449')

const packs = orig.coinPacks
const edited = packs.map(p => (p.id === 'p2' ? { ...p, coins: 700, bonus: 100, price: 299 } : p))
r = await putCfg('coinPacks', edited)
ok(r.status === 200, 'admin changes p2 to 700 coins + 100 bonus for ₹299', r.body)
const seen = (await pub()).coinPacks.find(p => p.id === 'p2')
ok(seen.coins === 700 && seen.bonus === 100 && seen.price === 299, 'the app config shows the new pack straight away', seen)
const before = (await call('GET', '/me', T)).body.user.coins
const old = await call('POST', '/wallet/orders', T, { packId: 'p1' }) // an order placed before the change stays as it was
ok(old.status === 201 && old.body.order.amount === 99, 'an unrelated pack still prices at ₹99')
r = await call('POST', '/wallet/orders', T, { packId: 'p2' })
ok(r.status === 201 && r.body.order.amount === 299 && r.body.order.coins === 700 && r.body.order.bonus === 100, 'ordering p2 charges ₹299 for 700 + 100 coins', r.body.order)
const c = await call('POST', `/wallet/orders/${r.body.order.id}/confirm`, T, { result: 'success', method: 'UPI' })
ok(c.body.applied && c.body.balance === before + 800, `buyer receives 800 coins (${before} → ${c.body.balance})`, c.body)
const me = (await call('GET', '/me', T)).body.user
ok(me.coinsBought >= 700, 'coinsBought counts the purchased coins')

// Edit again after an order exists: the finished order keeps what was agreed.
await putCfg('coinPacks', packs.map(p => (p.id === 'p2' ? { ...p, coins: 1000, bonus: 0, price: 399 } : p)))
const done = (await call('GET', '/wallet/orders?limit=5', T)).body.items.find(o => o.id === r.body.order.id)
ok(done && done.amount === 299 && done.coins === 700, 'a finished order keeps its original price and coins after the pack is edited', done)

r = await putCfg('coinPacks', packs.map(p => (p.id === 'p3' ? { ...p, active: false } : p)))
ok(!(await call('GET', '/wallet/packs', T)).body.packs.some(p => p.id === 'p3'), 'a deactivated pack disappears from the store')
r = await call('POST', '/wallet/orders', T, { packId: 'p3' })
ok(r.status === 400, 'and can no longer be ordered', r.body)

const extra = { id: 'p8', coins: 50, bonus: 0, price: 49, tag: 'Starter', active: true, firstRecharge: false }
r = await putCfg('coinPacks', [...packs, extra])
ok(r.status === 200 && (await call('GET', '/wallet/packs', T)).body.packs.some(p => p.id === 'p8'), 'admin adds a new pack (50 coins for ₹49)')
r = await call('POST', '/wallet/orders', T, { packId: 'p8' })
ok(r.status === 201 && r.body.order.amount === 49 && r.body.order.coins === 50, 'new pack orders at ₹49 for 50 coins', r.body.order)

for (const [label, bad] of [
  ['price 0', { ...extra, id: 'p9', price: 0 }],
  ['negative price', { ...extra, id: 'p9', price: -5 }],
  ['0 coins', { ...extra, id: 'p9', coins: 0 }],
  ['negative bonus', { ...extra, id: 'p9', bonus: -1 }],
  ['fractional coins', { ...extra, id: 'p9', coins: 10.5 }],
  ['missing id', { ...extra, id: '' }],
]) {
  const x = await putCfg('coinPacks', [...packs, bad])
  ok(x.status === 400, `pack with ${label} is refused`, x.body?.error?.message)
}
r = await putCfg('coinPacks', [...packs, { ...packs[0] }])
ok(r.status === 400, 'duplicate pack ids are refused')
ok((await cfg()).coinPacks.length === packs.length + 1, 'refused edits leave the pack list unchanged')

// First-recharge pack: only a brand-new buyer sees it, then it disappears.
await putCfg('coinPacks', packs.map(p => (p.id === 'p7' ? { ...p, coins: 600, bonus: 600, price: 149 } : p)))
const fresh = await login('9111100001')
let fp = (await call('GET', '/wallet/packs', fresh.token)).body.packs.find(p => p.firstRecharge)
ok(fp && fp.coins === 600 && fp.bonus === 600 && fp.price === 149, 'a new buyer sees the edited first-recharge offer (600 + 600 for ₹149)', fp)
const fo = await call('POST', '/wallet/orders', fresh.token, { packId: fp.id })
const fc = await call('POST', `/wallet/orders/${fo.body.order.id}/confirm`, fresh.token, { result: 'success' })
ok(fc.body.applied && fc.body.balance === fresh.user.coins + 1200, `first recharge pays 1,200 coins (${fresh.user.coins} → ${fc.body.balance})`, fc.body)
ok(!(await call('GET', '/wallet/packs', fresh.token)).body.packs.some(p => p.firstRecharge), 'the offer is gone after that first purchase')
await putCfg('coinPacks', packs)

// ─────────────────────────────────────────────────────────────────────────────
section('Diamonds → coins')
r = await putCfg('diamondsPerCoin', { value: 4 })
ok(r.status === 200 && (await pub()).diamondsPerCoin === 4, 'admin sets 4 diamonds = 1 coin (app sees it)')
await User.updateOne({ phone: '9999999999' }, { $set: { diamonds: 400 } })
const coinsBeforeX = (await call('GET', '/me', T)).body.user.coins
r = await call('POST', '/store/diamonds/exchange', T, { diamonds: 400 })
ok(r.status === 201 && r.body.coins === 100, '400 diamonds → 100 coins at the new rate', r.body)
r = await call('POST', '/store/diamonds/exchange', T, { diamonds: 3 })
ok(r.status === 400, '3 diamonds is below the new minimum (4)')
r = await putCfg('diamondsPerCoin', { value: 0 })
ok(r.status === 400, 'a rate of 0 is refused')
await putCfg('diamondsPerCoin', { value: orig.diamondsPerCoin })

// ─────────────────────────────────────────────────────────────────────────────
section('Max gifts per send')
r = await putCfg('economy', { ...orig.economy, maxGiftQuantity: 5 })
ok(r.status === 200 && (await pub()).economy.maxGiftQuantity === 5, 'admin limits one send to 5 gifts (app sees it)')
ok((await sendGift('rose', 5)).status === 201, '5 roses go through')
r = await sendGift('rose', 6)
ok(r.status === 400 && /5/.test(r.body?.error?.message || ''), '6 roses are refused with the limit in the message', r.body)
for (const bad of [0, 1000, 'x']) {
  const x = await putCfg('economy', { ...orig.economy, maxGiftQuantity: bad })
  ok(x.status === 400, `limit ${JSON.stringify(bad)} is refused by the admin API`)
}
await putCfg('economy', { ...orig.economy })

// ─────────────────────────────────────────────────────────────────────────────
section('Live & rooms: women only (admin switch)')
const goLive = () => call('POST', '/lives', T, { mode: 'live', title: 'Switch test' })
r = await goLive()
ok(r.status === 403 && r.body?.error?.code === 'women_only_live', 'a man is refused by default', r.body)
const settings0 = (await cfg()).settings
ok(settings0.hostApply.liveWomenOnly === true, 'the setting is on by default')
r = await putCfg('settings', { ...settings0, hostApply: { ...settings0.hostApply, liveWomenOnly: false } })
ok(r.status === 200 && (await pub()).settings.hostApply.liveWomenOnly === false, 'admin turns it off (the app sees it)', r.body)
r = await goLive()
ok(r.status === 201, 'with the switch off a man can go live', r.body)
if (r.body?.live?.id) await call('POST', `/lives/${r.body.live.id}/end`, T)
r = await putCfg('settings', settings0)
ok(r.status === 200 && (await goLive()).status === 403, 'switching it back on blocks men again')

console.log(`\n${passed} passed, ${fails} failed`)
await disconnectDb()
process.exit(fails ? 1 : 0)
