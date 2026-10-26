import { ConfigEntry } from './config.model.js'
import { CONFIG_KEYS, DEFAULT_CONFIG } from './defaults.js'

// Config is read on almost every request (prices, commission), so it's
// cached in memory and refreshed whenever an admin saves.
let cache = null

export async function loadConfig() {
  const rows = await ConfigEntry.find().lean()
  const out = structuredClone(DEFAULT_CONFIG)
  for (const r of rows) out[r.key] = r.value
  // First boot: store the defaults so admins edit real rows.
  const missing = CONFIG_KEYS.filter(k => !rows.some(r => r.key === k))
  if (missing.length) {
    await ConfigEntry.insertMany(missing.map(key => ({ key, value: DEFAULT_CONFIG[key], updatedBy: 'system' })))
  }
  cache = out
  return out
}

export function getConfig() {
  if (!cache) throw new Error('Config not loaded — call loadConfig() at startup')
  return cache
}

export async function setConfig(key, value, by) {
  if (!CONFIG_KEYS.includes(key)) throw new Error(`Unknown config key ${key}`)
  await ConfigEntry.updateOne({ key }, { value, updatedBy: by }, { upsert: true })
  cache = { ...getConfig(), [key]: value }
  return cache[key]
}

/** The subset the app needs (no moderation keyword lists, no commission). */
export function publicConfig() {
  const c = getConfig()
  const { moderation, ...settings } = c.settings
  return {
    economy: {
      messageCost: c.economy.messageCost,
      coinInr: c.economy.coinInr,
      minWithdraw: c.economy.minWithdraw,
      withdrawFee: c.economy.withdrawFee,
      payoutTime: c.economy.payoutTime,
      commission: c.economy.commission, // hosts see their share in the app
      agencyCut: c.economy.agencyCut,
    },
    coinPacks: c.coinPacks.filter(p => p.active),
    gifts: c.gifts.filter(g => g.active).sort((a, b) => a.order - b.order),
    hostLevels: c.hostLevels,
    rateTiers: c.rateTiers,
    vipTiers: c.vipTiers.filter(t => t.active),
    royalClub: c.royalClub.filter(t => t.active),
    storeItems: c.storeItems.filter(i => i.active),
    families: { createCost: c.families.createCost, joinReward: c.families.joinReward, maxMembers: c.families.maxMembers },
    diamondsPerCoin: c.diamondsPerCoin,
    settings: {
      ...settings,
      // The reviewer login code is a secret: never sent to apps.
      otp: { length: settings.otp.length, expirySecs: settings.otp.expirySecs, resendSecs: settings.otp.resendSecs },
      blockContactSharing: moderation.blockContactSharing,
    },
  }
}
