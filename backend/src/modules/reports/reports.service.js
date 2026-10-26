import { User } from '../users/user.model.js'
import { audit } from '../audit/audit.model.js'
import { getConfig } from '../config/config.service.js'
import { toUser } from '../../core/realtime.js'
import { Report } from './reports.models.js'

const HIGH = /nud|sexual|porn|underage|minor|child|hate/i
const MEDIUM = /contact|payment|paytm|upi|whatsapp|outside app|harass|abus|threat|bully/i

/** high: nudity, underage, hate · medium: contact/payment, harassment · low: the rest. */
export function priorityFor(reason, details = '') {
  if (HIGH.test(reason)) return 'high'
  if (MEDIUM.test(reason)) return 'medium'
  // Details only ever raise a report to medium, so free text can't jump the queue.
  if (HIGH.test(details) || MEDIUM.test(details)) return 'medium'
  return 'low'
}

/**
 * Suspends a user/host once they reach settings.moderation.maxReportsBeforeAutoSuspend
 * open reports. Indefinite until a moderator reviews it. Returns true if it acted.
 */
export async function maybeAutoSuspend(targetType, targetId) {
  if (targetType !== 'user' && targetType !== 'host') return false
  const max = getConfig().settings?.moderation?.maxReportsBeforeAutoSuspend
  if (!(max > 0)) return false
  const open = await Report.countDocuments({ targetType: { $in: ['user', 'host'] }, targetId, status: 'open' })
  if (open < max) return false
  const reason = `Auto-suspended after ${open} open reports`
  const set = { status: 'suspended', statusReason: reason, suspendedUntil: null }
  if (targetType === 'host') Object.assign(set, { 'host.status': 'suspended', 'host.online': false })
  // Conditional so concurrent reports only suspend (and audit) once.
  const r = await User.updateOne({ _id: targetId, status: 'active' }, { $set: set })
  if (!r.modifiedCount) return false
  await audit({}, `${reason} (${targetType})`, targetId, { auto: true, openReports: open })
  toUser(targetId, 'account:status', { status: 'suspended', reason })
  return true
}
