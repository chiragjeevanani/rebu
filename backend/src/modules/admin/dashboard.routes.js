import { Router } from 'express'
import { ah } from '../../core/http.js'
import { requireAdmin } from '../../core/auth.js'
import { Admin } from '../admins/admin.model.js'
import { User } from '../users/user.model.js'
import { CoinTxn, Payment } from '../wallet/wallet.models.js'
import { Dispute, Earning, Withdrawal } from '../earnings/earnings.models.js'
import { HostApplication } from '../hosts/hosts.models.js'
import { Report, SupportTicket } from '../reports/reports.models.js'
import { DAY, dayExpr, dayKeys, istDayStart, optModel, round2, TZ, withId, whoMap } from './admin.util.js'

export const dashboardAdmin = Router()
dashboardAdmin.use(requireAdmin(Admin, 'dashboard'))

const sumBy = async (Model, match, field) => (await Model.aggregate([{ $match: match }, { $group: { _id: null, v: { $sum: field } } }]))[0]?.v || 0
const byDayMap = async (Model, match, dateField, sum) =>
  new Map(
    (await Model.aggregate([{ $match: match }, { $group: { _id: dayExpr(dateField), n: { $sum: 1 }, v: { $sum: sum ?? 1 } } }])).map(x => [x._id, x]),
  )

/**
 * Daily active users, approximated: users whose lastActive falls on the day
 * plus anyone with a coin movement (call, gift, purchase…) that day. Older
 * days undercount people who were active then and again later, since only the
 * latest lastActive is stored — swap in a real activity log for exact DAU.
 */
async function dauByDay(from, to) {
  const rows = await User.aggregate([
    { $match: { lastActive: { $gte: from, $lt: to } } },
    { $project: { u: '$_id', d: { $dateToString: { format: '%Y-%m-%d', date: '$lastActive', timezone: TZ } } } },
    {
      $unionWith: {
        coll: CoinTxn.collection.name,
        pipeline: [{ $match: { createdAt: { $gte: from, $lt: to } } }, { $project: { u: '$user', d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } } } }],
      },
    },
    { $group: { _id: { d: '$d', u: '$u' } } },
    { $group: { _id: '$_id.d', n: { $sum: 1 } } },
  ])
  return new Map(rows.map(x => [x._id, x.n]))
}

const trend = (cur, prev) => ({ value: round2(cur), previous: round2(prev), change: prev ? round2(((cur - prev) / prev) * 100) : null })

dashboardAdmin.get(
  '/',
  ah(async (req, res) => {
    const days = Number(req.query.days) === 30 ? 30 : 7
    const now = new Date()
    const from = istDayStart(days - 1)
    const prevFrom = new Date(from.getTime() - days * DAY)
    const today = istDayStart(0)
    const cur = { $gte: from, $lte: now }
    const prev = { $gte: prevFrom, $lt: from }
    const Call = optModel('Call')
    const Live = optModel('Live')

    const [
      revenue, prevRevenue, payDays, earnCur, earnPrev, earnDays, callCur, callPrev, callDays,
      dauDays, dauPrev, newUserDays, newHostDays, payoutDays,
      hostsOnline, activeLives, callsLive, newUsersToday,
      pendingApps, reqWd, openReports, highReports, openDisputes, openTickets,
      topHosts, latestPayments,
    ] = await Promise.all([
      sumBy(Payment, { status: 'success', createdAt: cur }, '$amount'),
      sumBy(Payment, { status: 'success', createdAt: prev }, '$amount'),
      byDayMap(Payment, { status: 'success', createdAt: cur }, '$createdAt', '$amount'),
      sumBy(Earning, { status: { $ne: 'reversed' }, createdAt: cur }, '$net'),
      sumBy(Earning, { status: { $ne: 'reversed' }, createdAt: prev }, '$net'),
      byDayMap(Earning, { status: { $ne: 'reversed' }, createdAt: cur }, '$createdAt', '$net'),
      Call ? Call.countDocuments({ createdAt: cur }) : 0,
      Call ? Call.countDocuments({ createdAt: prev }) : 0,
      Call ? byDayMap(Call, { createdAt: cur }, '$createdAt', { $ifNull: ['$minutes', 0] }) : new Map(),
      dauByDay(from, now),
      dauByDay(prevFrom, from),
      byDayMap(User, { createdAt: cur, 'host.approved': { $ne: true } }, '$createdAt'),
      byDayMap(User, { 'host.approvedAt': cur }, '$host.approvedAt'),
      byDayMap(Withdrawal, { status: 'paid', paidAt: cur }, '$paidAt', '$amount'),
      User.countDocuments({ 'host.approved': true, 'host.online': true, 'host.status': 'active' }),
      Live ? Live.countDocuments({ status: 'live' }) : 0,
      Call ? Call.countDocuments({ status: 'connected' }) : 0,
      User.countDocuments({ createdAt: { $gte: today } }),
      HostApplication.countDocuments({ status: 'pending' }),
      Withdrawal.aggregate([{ $match: { status: 'requested' } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amount' } } }]),
      Report.countDocuments({ status: 'open' }),
      Report.countDocuments({ status: 'open', priority: 'high' }),
      Dispute.countDocuments({ status: 'open' }),
      SupportTicket.countDocuments({ status: 'open' }),
      Earning.aggregate([
        { $match: { status: { $ne: 'reversed' }, createdAt: cur, source: { $ne: 'bonus' } } },
        { $group: { _id: '$host', net: { $sum: '$net' }, coins: { $sum: '$coins' }, minutes: { $sum: { $ifNull: ['$minutes', 0] } } } },
        { $sort: { net: -1 } },
        { $limit: 5 },
      ]),
      Payment.find({ status: 'success' }).sort({ createdAt: -1 }).limit(8).lean(),
    ])

    const series = dayKeys(days).map(k => ({
      day: k,
      revenue: round2(payDays.get(k)?.v || 0),
      payments: payDays.get(k)?.n || 0,
      dau: dauDays.get(k) || 0,
      newUsers: newUserDays.get(k)?.n || 0,
      newHosts: newHostDays.get(k)?.n || 0,
      calls: callDays.get(k)?.n || 0,
      callMinutes: callDays.get(k)?.v || 0,
      hostEarnings: round2(earnDays.get(k)?.v || 0),
      hostPayouts: round2(payoutDays.get(k)?.v || 0),
    }))
    const avg = m => (m.size ? [...m.values()].reduce((a, b) => a + b, 0) / days : 0)
    const people = await whoMap([...topHosts.map(h => h._id), ...latestPayments.map(p => p.user)])

    res.json({
      days,
      kpis: {
        revenue: trend(revenue, prevRevenue),
        dau: { ...trend(Math.round(avg(dauDays)), Math.round(avg(dauPrev))), approximate: true, note: 'Users with lastActive or a coin movement that day; past days undercount.' },
        calls: { ...trend(callCur, callPrev), available: !!Call },
        hostEarnings: trend(earnCur, earnPrev),
      },
      live: { hostsOnline, activeLives, callsInProgress: callsLive, newUsersToday, livesAvailable: !!Live, callsAvailable: !!Call },
      attention: {
        pendingApplications: pendingApps,
        withdrawalsRequested: { count: reqWd[0]?.n || 0, amount: round2(reqWd[0]?.amount || 0) },
        openReports: { count: openReports, high: highReports },
        openDisputes,
        openTickets,
      },
      series,
      topHosts: topHosts.map(h => ({ ...(people.get(String(h._id)) || { id: String(h._id) }), net: round2(h.net), coins: h.coins, minutes: h.minutes })),
      latestPayments: latestPayments.map(p => {
        const u = people.get(String(p.user))
        return { ...withId(p), userId: String(p.user), userName: u?.name, userAvatar: u?.avatar, ts: p.createdAt }
      }),
    })
  }),
)
