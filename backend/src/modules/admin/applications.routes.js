import { Router } from 'express'
import { z } from 'zod'
import { ah, parse, paging, paged } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { audit } from '../audit/audit.model.js'
import { User } from '../users/user.model.js'
import { Agency, HostApplication } from '../hosts/hosts.models.js'
import { getConfig } from '../config/config.service.js'
import { notReady, optImport, rx, withId } from './admin.util.js'

export const applicationsAdmin = Router()
applicationsAdmin.use(requireAdmin(Admin, 'applications'))

const age = dob => (dob ? Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000)) : null)

function appRow(a, u) {
  return {
    ...withId(a),
    user: String(a.user),
    phone: u?.phone,
    avatar: a.photos?.[0] || null,
    age: age(a.dob),
    idType: a.id?.type,
    idLast4: a.id?.last4,
    idPhoto: a.id?.photo,
    submittedAt: a.createdAt,
  }
}

/** The same checks the review page shows, computed server-side. */
function autoFlags(a, agency) {
  const { settings } = getConfig()
  const minAge = settings.hostApply?.minAge || 18
  const keywords = settings.moderation?.autoFlagKeywords || []
  const code = (a.agencyCode || '').trim().toUpperCase()
  const bio = String(a.bio || '')
  const out = []
  const years = age(a.dob)
  if (years !== null && years < minAge) out.push({ text: `Under ${minAge} (age ${years})`, tone: 'danger' })
  if (typeof a.faceMatch === 'number' && a.faceMatch < 70) out.push({ text: `Face match only ${a.faceMatch}%`, tone: 'danger' })
  if (code && !agency) out.push({ text: `Agency code ${code} doesn’t match any agency`, tone: 'warning' })
  if (agency && agency.status !== 'active') out.push({ text: `Agency ${agency.name} is suspended`, tone: 'warning' })
  if (/\d{7,}|\d{3,}[\s-]\d{3,}|@|https?:|\.com/i.test(bio) || keywords.some(k => bio.toLowerCase().includes(k))) {
    out.push({ text: 'Bio may contain contact details', tone: 'warning' })
  }
  // Flags stored at submit come first; skip auto flags that say the same thing.
  const stored = a.flags || []
  const covered = f =>
    stored.includes(f.text) || (/agency/i.test(f.text) && stored.some(s => /agency/i.test(s))) || (/contact/i.test(f.text) && stored.some(s => /contact/i.test(s)))
  return [...stored.map(text => ({ text, tone: 'warning' })), ...out.filter(f => !covered(f))]
}

applicationsAdmin.get(
  '/',
  ah(async (req, res) => {
    const q = req.query
    const pg = paging(q)
    const status = ['pending', 'approved', 'rejected'].includes(q.status) ? q.status : 'pending'
    const f = { status }
    if (q.q) {
      const r = rx(q.q)
      f.$or = [{ name: r }, { agencyCode: r }, ...(/^[a-f\d]{24}$/i.test(q.q.trim()) ? [{ _id: q.q.trim() }, { user: q.q.trim() }] : [])]
    }
    // Oldest pending first (FIFO queue); decided ones newest first.
    const sort = status === 'pending' ? { createdAt: 1 } : { reviewedAt: -1, createdAt: -1 }
    const [rows, total, counts] = await Promise.all([
      HostApplication.find(f).sort(sort).skip(pg.skip).limit(pg.limit).lean(),
      HostApplication.countDocuments(f),
      HostApplication.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    ])
    const users = new Map((await User.find({ _id: { $in: rows.map(a => a.user) } }, { phone: 1 }).lean()).map(u => [String(u._id), u]))
    res.json({
      ...paged(rows.map(a => appRow(a, users.get(String(a.user)))), total, pg),
      counts: Object.fromEntries(counts.map(c => [c._id, c.n])),
    })
  }),
)

applicationsAdmin.get(
  '/:id',
  ah(async (req, res) => {
    const a = await HostApplication.findById(req.params.id).lean()
    if (!a) throw notFound('Application')
    const code = (a.agencyCode || '').trim().toUpperCase()
    const [u, agency, prevApps] = await Promise.all([
      User.findById(a.user, { phone: 1, name: 1, createdAt: 1, status: 1, 'host.approved': 1 }).lean(),
      code ? Agency.findOne({ code }).lean() : null,
      HostApplication.find({ user: a.user, _id: { $ne: a._id } }, { status: 1, reasons: 1, createdAt: 1 }).sort({ createdAt: -1 }).lean(),
    ])
    // Neighbours in the pending queue for prev/next navigation.
    const [prev, next] = await Promise.all([
      HostApplication.findOne({ status: 'pending', createdAt: { $lt: a.createdAt } }, { _id: 1 }).sort({ createdAt: -1 }).lean(),
      HostApplication.findOne({ status: 'pending', createdAt: { $gt: a.createdAt } }, { _id: 1 }).sort({ createdAt: 1 }).lean(),
    ])
    res.json({
      application: appRow(a, u),
      account: u ? withId(u) : null,
      matchingAgency: agency ? withId(agency) : null,
      flags: autoFlags(a, agency),
      previousApplications: prevApps.map(withId),
      prevId: prev ? String(prev._id) : null,
      nextId: next ? String(next._id) : null,
    })
  }),
)

const hostsService = name => optImport(['../hosts/hosts.service.js'], name)

async function pendingApp(id) {
  const a = await HostApplication.findById(id)
  if (!a) throw notFound('Application')
  if (a.status !== 'pending') throw conflict(`This application was already ${a.status}.`)
  return a
}

applicationsAdmin.post(
  '/:id/approve',
  ah(async (req, res) => {
    const approve = await hostsService('approveApplication')
    if (!approve) throw notReady('Host approval')
    const a = await pendingApp(req.params.id)
    // Applications sent before hosting became women-only can't be approved.
    if (getConfig().settings.hostApply.womenOnly && a.gender !== 'Female') {
      throw badRequest('Hosting is open to women only. Reject this application, or turn off "Women only" in App settings.')
    }
    const result = await approve(a, req.admin.name)
    await audit(req, `Approved host application — ${a.name}`, a._id, { user: String(a.user) })
    const fresh = await HostApplication.findById(a._id).lean()
    res.json({ application: appRow(fresh), result: result ?? null })
  }),
)

applicationsAdmin.post(
  '/:id/reject',
  ah(async (req, res) => {
    const { reasons } = parse(z.object({ reasons: z.array(z.string().trim().min(1).max(300)).min(1).max(10) }), req.body)
    const reject = await hostsService('rejectApplication')
    if (!reject) throw notReady('Host rejection')
    const a = await pendingApp(req.params.id)
    await reject(a, reasons, req.admin.name)
    await audit(req, `Rejected host application — ${a.name}: ${reasons.join('; ')}`, a._id, { user: String(a.user) })
    const fresh = await HostApplication.findById(a._id).lean()
    res.json({ application: appRow(fresh) })
  }),
)
