// Host lifecycle shared by the app and the admin panel: application review,
// levels, agency lookup, and small helpers for day boundaries and masking.
import { User } from '../users/user.model.js'
import { Agency, HostApplication } from './hosts.models.js'
import { getConfig } from '../config/config.service.js'
import { levelForGifts, recordEarning, withTxn } from '../wallet/economy.service.js'
import { toUser } from '../../core/realtime.js'
import { notify } from '../notifications/notifications.js'
import { conflict, notFound } from '../../core/errors.js'

const DAY = 864e5
// India-only app: "today" means the IST calendar day, whatever the server TZ.
const IST = 330 * 60000

/** Start of the IST day `daysBack` days ago, as a Date. */
export function istDayStart(daysBack = 0, now = Date.now()) {
  return new Date(Math.floor((now + IST) / DAY) * DAY - IST - daysBack * DAY)
}

/** IST date key (YYYY-MM-DD) for a timestamp. */
export const istDayKey = d => new Date(new Date(d).getTime() + IST).toISOString().slice(0, 10)

export const maskAccount = acc => (acc ? `••${String(acc).slice(-4)}` : undefined)

export const ageOn = (dob, now = Date.now()) => (now - new Date(dob).getTime()) / (365.25 * DAY)

/** Effective level: admin override, else by lifetime gift coins received. */
export const hostLevel = host => host?.levelOverride || levelForGifts(host?.giftCoins || 0)

export const levelCap = level => {
  const { hostLevels } = getConfig()
  return (hostLevels.find(l => l.level === level) || hostLevels[0]).maxRate
}

/** Active agency for a code, or null. */
export async function activeAgency(code, session) {
  if (!code) return null
  const a = await Agency.findOne({ code: String(code).trim().toUpperCase() }).session(session || null)
  return a?.status === 'active' ? a : null
}

// Phone-like digit runs, handles, and the usual "move off-platform" words.
const CONTACT_RE = /(\d[\d\s-]{8,}\d)|@|whats\s*app|insta|telegram|snap(chat)?|wa\.me|gmail|paytm|call me on/i

/** Automatic review flags (human-readable, shown as-is in the admin panel). */
export async function applicationFlags({ agencyCode, bio, dob }) {
  const { settings } = getConfig()
  const flags = []
  if (agencyCode) {
    const a = await Agency.findOne({ code: agencyCode.trim().toUpperCase() })
    if (!a) flags.push('Agency code not found')
    else if (a.status !== 'active') flags.push('Agency is suspended')
  }
  const text = bio || ''
  const keywords = settings.moderation?.autoFlagKeywords || []
  if (CONTACT_RE.test(text) || keywords.some(k => text.toLowerCase().includes(k.toLowerCase()))) {
    flags.push('Contact details in bio')
  }
  if (ageOn(dob) < settings.hostApply.minAge + 1) flags.push('Age close to limit — check ID')
  return flags
}

const appId = app => app?._id || app

/**
 * Approve a pending application: makes the user a level-1 host and pays the
 * welcome bonus, all in one transaction. Throws 409 if it isn't pending.
 */
export async function approveApplication(app, reviewerName) {
  const { economy } = getConfig()
  const out = await withTxn(async s => {
    const a = await HostApplication.findOneAndUpdate(
      { _id: appId(app), status: 'pending' },
      { status: 'approved', reasons: [], reviewedBy: reviewerName, reviewedAt: new Date() },
      { returnDocument: 'after', session: s },
    )
    if (!a) throw conflict('This application has already been reviewed.')
    const user = await User.findById(a.user).session(s)
    if (!user) throw notFound('User')
    if (user.host?.approved) throw conflict('This user is already a host.')

    const cap = levelCap(1)
    const agency = await activeAgency(a.agencyCode, s)
    Object.assign(user.host, {
      approved: true,
      approvedAt: new Date(),
      status: 'active',
      level: 1,
      levelOverride: null,
      rates: { video: Math.min(a.rates?.video || 40, cap), voice: Math.min(a.rates?.voice || 20, cap) },
      online: false,
      busy: false,
      displayName: a.name,
      photos: a.photos,
      languages: a.languages,
      bio: a.bio,
      agencyId: agency?._id || null,
    })
    if (!user.gender) user.gender = a.gender
    if (!user.dob) user.dob = a.dob
    await user.save({ session: s })

    if (economy.welcomeBonusCoins > 0) {
      await recordEarning(user._id, { source: 'bonus', coins: economy.welcomeBonusCoins, detail: 'New host welcome bonus' }, s)
    }
    return a
  })
  toUser(out.user, 'host:application', { status: 'approved', reasons: [] })
  notify(out.user, { kind: 'host', title: 'You’re a REBU host! 🎉', body: 'Your application was approved. Go online to start earning.', deeplink: 'rebu://host', push: 'always' })
  return out
}

/** Reject a pending application with reasons the applicant will see. */
export async function rejectApplication(app, reasons, reviewerName) {
  const a = await HostApplication.findOneAndUpdate(
    { _id: appId(app), status: 'pending' },
    { status: 'rejected', reasons: reasons || [], reviewedBy: reviewerName, reviewedAt: new Date() },
    { returnDocument: 'after' },
  )
  if (!a) throw conflict('This application has already been reviewed.')
  toUser(a.user, 'host:application', { status: 'rejected', reasons: a.reasons })
  notify(a.user, { kind: 'host', title: 'Host application not approved', body: (a.reasons || [])[0] || 'See the details and apply again.', deeplink: 'rebu://host/status', push: 'always' })
  return a
}
