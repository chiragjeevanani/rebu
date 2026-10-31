import { Router } from 'express'
import { z } from 'zod'
import { ah, parse } from '../../core/http.js'
import { forbidden, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { getConfig, setConfig } from '../config/config.service.js'
import { CONFIG_KEYS } from '../config/defaults.js'
import { ConfigEntry } from '../config/config.model.js'

export const configAdmin = Router()

// ── Schemas ──────────────────────────────────────────────────────────────
const pct = z.number().min(0).max(90)
const int0 = z.number().int().min(0)
const pos = z.number().positive()
const str = (max = 200) => z.string().trim().max(max)
const unique = key => list => new Set(list.map(x => x[key])).size === list.length

const economy = z
  .object({
    coinInr: pos.max(100),
    commission: z.object({ video: pct, voice: pct, chat: pct, gift: pct, ticket: pct, bonus: pct }).strict(),
    agencyCut: pct,
    withdrawFee: pct,
    minWithdraw: int0,
    maxWithdrawPerDay: int0,
    payoutTime: str(60).min(1),
    welcomeBonusCoins: int0,
    messageCost: int0,
    newUserCoins: int0,
    minLiveBalance: int0.default(0),
    maxGiftQuantity: z.number().int().min(1).max(999).default(99),
  })
  .strict()
  .refine(e => e.maxWithdrawPerDay >= e.minWithdraw, { message: 'Max per day must be at least the minimum withdrawal', path: ['maxWithdrawPerDay'] })

const coinPacks = z
  .array(
    z.object({
      id: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/i),
      coins: z.number().int().positive(),
      bonus: int0.default(0),
      price: pos,
      tag: str(30).default(''),
      active: z.boolean().default(true),
      firstRecharge: z.boolean().default(false),
    }),
  )
  .max(50)
  .refine(unique('id'), 'Pack ids must be unique')

const gifts = z
  .array(
    z.object({
      key: z.string().trim().regex(/^[a-z0-9_-]{1,32}$/),
      name: str(40).min(1),
      emoji: str(16).default(''),
      image: str(500).optional(),
      animation: str(500).optional(),
      coins: z.number().int().positive(),
      fullScreen: z.boolean().default(false),
      category: str(30).min(1),
      active: z.boolean().default(true),
      order: z.number().int().min(0),
    }),
  )
  .max(200)
  .refine(unique('key'), 'Gift keys must be unique')

const increasing = (list, k) => list.every((x, i) => i === 0 || x[k] > list[i - 1][k])
const hostCategories = z
  .array(
    z
      .object({
        key: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/),
        name: str(30).min(1),
        fromLevel: z.number().int().positive(),
        maxRate: z.number().int().positive(),
        commissionDiscount: pct,
        color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour'),
      })
      .strict(),
  )
  .min(1)
  .max(12)
  .refine(unique('key'), 'Category keys must be unique')
  .refine(l => l[0].fromLevel === 1, 'The first category must start at level 1')
  .refine(l => increasing(l, 'fromLevel'), 'Categories must start at increasing levels')
// Levels: gift-coin thresholds. Category, price cap and discount come from the category table.
const hostLevels = z
  .array(z.object({ level: z.number().int().positive(), giftCoins: int0 }).passthrough())
  .min(1)
  .max(200)
  .refine(l => l[0].level === 1 && l[0].giftCoins === 0, 'Level 1 must start at 0 gift coins')
  .refine(l => increasing(l, 'level'), 'Levels must be strictly increasing')
  .refine(l => increasing(l, 'giftCoins'), 'Gift coins must be strictly increasing')
const senderTiers = z
  .array(
    z
      .object({
        key: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/),
        name: str(30).min(1),
        minCoins: int0,
        color: z.union([z.literal(''), z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour')]),
      })
      .strict(),
  )
  .min(1)
  .max(20)
  .refine(unique('key'), 'Tier keys must be unique')
  .refine(l => l[0].minCoins === 0, 'The first tier must start at 0 coins')
  .refine(l => increasing(l, 'minCoins'), 'Coin thresholds must be strictly increasing')

const tiers = z
  .array(z.number().int().positive())
  .min(1)
  .max(30)
  .refine(t => t.every((x, i) => i === 0 || x > t[i - 1]), 'Tiers must be sorted and unique')
const rateTiers = z.object({ video: tiers, voice: tiers }).strict()

const perks = z.array(str(80).min(1)).max(20)
const vipTiers = z
  .array(z.object({ level: z.number().int().positive(), name: str(40).min(1), price: pos, days: z.number().int().positive(), active: z.boolean(), perks }).strict())
  .max(10)
  .refine(unique('level'), 'VIP levels must be unique')
const royalClub = z
  .array(z.object({ key: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/), name: str(40).min(1), emoji: str(16), price: pos, coinsBack: int0.optional(), active: z.boolean(), perks }).strict())
  .max(10)
  .refine(unique('key'), 'Tier keys must be unique')

const storeItems = z
  .array(
    z
      .object({
        id: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/i),
        category: z.enum(['frame', 'entry', 'bubble']),
        name: str(40).min(1),
        emoji: str(16),
        price: z.number().int().positive(),
        days: z.number().int().positive().max(365),
        active: z.boolean(),
      })
      .strict(),
  )
  .max(100)
  .refine(unique('id'), 'Item ids must be unique')

const TASK_METRICS = {
  user: ['checkin', 'video_calls', 'greetings', 'gifts_sent', 'profile', 'following', 'recharged'],
  host: ['calls_answered', 'live_minutes', 'earned_inr'],
}
const taskList = metrics =>
  z
    .array(
      z
        .object({
          id: z.string().trim().regex(/^[a-z0-9_-]{1,24}$/i),
          group: z.enum(['Daily', 'Newbie']),
          title: str(60).min(1),
          metric: z.enum(metrics),
          goal: z.number().int().positive(),
          reward: z.number().int().positive(),
          active: z.boolean(),
        })
        .strict(),
    )
    .max(30)
    .refine(unique('id'), 'Task ids must be unique')
const tasks = z.object({ user: taskList(TASK_METRICS.user), host: taskList(TASK_METRICS.host) }).strict()

const families = z
  .object({ createCost: int0, joinReward: int0, maxMembers: z.number().int().min(2).max(10000), levelCoins: z.array(int0).min(1).max(20) })
  .strict()

const diamondsPerCoin = z.number().int().min(1).max(100)

const version = z.string().trim().regex(/^\d+\.\d+\.\d+$/, 'Use x.y.z')
const settings = z
  .object({
    maintenance: z.boolean(),
    maintenanceMessage: str(300),
    minVersion: z.object({ android: version, ios: version }).strict(),
    latestVersion: z.object({ android: version, ios: version }).strict(),
    forceUpdate: z.boolean(),
    login: z.record(z.string(), z.boolean()),
    otp: z
      .object({
        provider: str(40).min(1),
        length: z.number().int().min(4).max(8),
        expirySecs: z.number().int().min(30).max(3600),
        resendSecs: z.number().int().min(10).max(600),
        // App-store reviewer login: this number always accepts this code (no SMS).
        testNumber: z.union([z.literal(''), z.string().regex(/^[6-9]\d{9}$/, 'A 10-digit mobile number')]).optional(),
        testOtp: z.union([z.literal(''), z.string().regex(/^\d{4,8}$/, '4–8 digits')]).optional(),
      })
      .strict(),
    features: z.record(z.string(), z.boolean()),
    hostApply: z
      .object({ minAge: z.number().int().min(18).max(99), womenOnly: z.boolean().default(true), liveWomenOnly: z.boolean().default(true), autoApprove: z.boolean(), requireSelfie: z.boolean(), requireId: z.boolean(), idTypes: z.array(str(40).min(1)).min(1) })
      .strict(),
    moderation: z
      .object({
        autoFlagKeywords: z.array(str(60).min(1)).max(500),
        blockContactSharing: z.boolean(),
        maxReportsBeforeAutoSuspend: z.number().int().min(0).max(1000), // 0 = off
        liveRecordingForReview: z.boolean(),
      })
      .strict(),
    limits: z
      .object({
        maxGuestsInLive: z.number().int().min(0).max(20),
        maxRoomSeats: z.number().int().min(1).max(50),
        ringTimeoutSecs: z.number().int().min(10).max(120),
        freeMessagesPerDay: int0,
        maxCallsAtOnce: z.number().int().min(1).max(4).default(2),
      })
      .strict(),
    support: z.object({ email: z.union([z.literal(''), z.string().email()]), whatsapp: str(20), hours: str(60) }).strict(),
  })
  .strict()
  .refine(s => s.otp.resendSecs < s.otp.expirySecs, { message: 'Resend wait must be shorter than expiry', path: ['otp', 'resendSecs'] })

const SCHEMAS = { economy, coinPacks, gifts, hostCategories, hostLevels, senderTiers, rateTiers, vipTiers, royalClub, storeItems, tasks, families, diamondsPerCoin, settings }
const SECTION = { settings: 'settings' } // everything else is monetization
const sectionOf = key => SECTION[key] || 'monetization'

// ── Diff summary for the audit log ───────────────────────────────────────
const keyOf = x => (x && typeof x === 'object' ? x.id ?? x.key ?? x.level : undefined)
function flatten(v, path, out) {
  if (Array.isArray(v) && v.length && v.every(x => keyOf(x) !== undefined)) {
    for (const x of v) flatten(x, `${path}[${keyOf(x)}]`, out)
    out.set(`${path}#order`, JSON.stringify(v.map(keyOf)))
  } else if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, x] of Object.entries(v)) flatten(x, path ? `${path}.${k}` : k, out)
  } else out.set(path, JSON.stringify(v))
  return out
}
const short = s => (s === undefined ? '∅' : s.length > 40 ? `${s.slice(0, 37)}…` : s)
export function diffSummary(before, after) {
  const a = flatten(before, '', new Map())
  const b = flatten(after, '', new Map())
  const changes = []
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) !== b.get(k) && !k.endsWith('#order')) changes.push(`${k}: ${short(a.get(k))} → ${short(b.get(k))}`)
  }
  if (!changes.length && [...a.keys()].some(k => k.endsWith('#order') && a.get(k) !== b.get(k))) changes.push('reordered')
  return { changes, text: changes.length ? changes.slice(0, 6).join(', ') + (changes.length > 6 ? ` +${changes.length - 6} more` : '') : 'no changes' }
}

// ── Routes ───────────────────────────────────────────────────────────────
// Every admin page reads config (prices, levels, flags), so GET only needs a session.
configAdmin.get(
  '/',
  requireAdmin(Admin),
  ah(async (req, res) => {
    const meta = await ConfigEntry.find({}, { key: 1, updatedBy: 1, updatedAt: 1 }).lean()
    res.json({ config: getConfig(), meta: Object.fromEntries(meta.map(m => [m.key, { updatedBy: m.updatedBy, updatedAt: m.updatedAt }])) })
  }),
)

configAdmin.put(
  '/:key',
  requireAdmin(Admin),
  ah(async (req, res) => {
    const { key } = req.params
    if (!CONFIG_KEYS.includes(key) || !SCHEMAS[key]) throw notFound('Config key')
    if (!req.admin.can(sectionOf(key))) throw forbidden()
    // Accept either the raw value or { value }.
    const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body) && 'value' in req.body ? req.body.value : req.body
    const value = parse(SCHEMAS[key], raw)
    const before = getConfig()[key]
    const diff = diffSummary(before, value)
    const saved = await setConfig(key, value, req.admin.name)
    await audit(req, `Updated ${key}: ${diff.text}`, key, { changes: diff.changes.slice(0, 50) })
    res.json({ key, value: saved, changes: diff.changes })
  }),
)
