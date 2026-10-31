// Fills counters added after accounts existed, from the ledgers they summarise:
// host.giftCoins (gift coins received → host level) and coinsBought (→ sender
// frame). Only touches documents that don't have the field yet, so it's a
// no-op after the first run.
import { onStartup } from '../../hooks.js'
import { User } from './user.model.js'
import { Earning } from '../earnings/earnings.models.js'
import { Payment } from '../wallet/wallet.models.js'
import { levelForGifts } from '../wallet/economy.service.js'

async function backfill() {
  const hosts = await User.find({ 'host.approved': true, 'host.giftCoins': { $exists: false } }, { _id: 1, host: 1 }).lean()
  if (hosts.length) {
    const sums = await Earning.aggregate([
      { $match: { host: { $in: hosts.map(h => h._id) }, source: 'gift', status: { $ne: 'reversed' } } },
      { $group: { _id: '$host', coins: { $sum: '$coins' } } },
    ])
    const by = new Map(sums.map(s => [String(s._id), s.coins]))
    for (const h of hosts) {
      const giftCoins = by.get(String(h._id)) || 0
      const set = { 'host.giftCoins': giftCoins }
      if (!h.host.levelOverride) set['host.level'] = levelForGifts(giftCoins)
      await User.updateOne({ _id: h._id }, { $set: set })
    }
  }
  const buyers = await User.find({ coinsBought: { $exists: false } }, { _id: 1 }).lean()
  if (buyers.length) {
    const sums = await Payment.aggregate([
      { $match: { user: { $in: buyers.map(b => b._id) }, status: { $in: ['success', 'refunded'] } } },
      { $group: { _id: '$user', coins: { $sum: { $add: ['$coins', { $ifNull: ['$bonus', 0] }] } } } },
    ])
    const by = new Map(sums.map(s => [String(s._id), s.coins]))
    await User.bulkWrite(buyers.map(b => ({ updateOne: { filter: { _id: b._id }, update: { $set: { coinsBought: by.get(String(b._id)) || 0 } } } })))
  }
  if (hosts.length || buyers.length) console.log(`[backfill] host levels for ${hosts.length}, sender frames for ${buyers.length}`)
}

onStartup(() => backfill().catch(e => console.error('[backfill]', e.message)))
