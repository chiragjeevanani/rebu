// Daily / newbie tasks. Progress is counted from what actually happened on the
// server (calls, greetings, gifts…), never reported by the app. A claim is
// unique per (user, task, period) so a reward can't be taken twice.
import { Router } from 'express'
import mongoose from 'mongoose'
import { ah } from '../../core/http.js'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { getConfig } from '../config/config.service.js'
import { creditCoins, recordEarning, withTxn } from '../wallet/economy.service.js'
import { CoinTxn } from '../wallet/wallet.models.js'
import { Call } from '../calls/call.model.js'
import { Message } from '../chat/chat.models.js'
import { Live } from '../lives/live.model.js'
import { Earning } from '../earnings/earnings.models.js'
import { istDayKey, istDayStart } from '../hosts/hosts.service.js'

const { Schema } = mongoose

const claimSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    taskId: { type: String, required: true },
    period: { type: String, required: true }, // IST day for Daily, 'once' for Newbie
    reward: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)
claimSchema.index({ user: 1, taskId: 1, period: 1 }, { unique: true })

export const TaskClaim = mongoose.models.TaskClaim || mongoose.model('TaskClaim', claimSchema)

const periodOf = t => (t.group === 'Daily' ? istDayKey(Date.now()) : 'once')

/** Today's (or lifetime) numbers for every metric the tasks use. */
async function metrics(user, wanted) {
  const since = istDayStart(0)
  const me = user._id
  const m = {}
  const need = k => wanted.has(k)
  await Promise.all([
    need('checkin') && (m.checkin = 1),
    need('video_calls') && Call.countDocuments({ caller: me, type: 'video', connectedAt: { $gte: since } }).then(n => (m.video_calls = n)),
    need('greetings') && Message.countDocuments({ from: me, greeting: true, createdAt: { $gte: since } }).then(n => (m.greetings = n)),
    need('gifts_sent') && CoinTxn.countDocuments({ user: me, type: 'gift', createdAt: { $gte: since } }).then(n => (m.gifts_sent = n)),
    need('profile') && (m.profile = user.profileDone && user.photos?.length ? 1 : 0),
    need('following') && (m.following = user.following?.length || 0),
    need('recharged') && (m.recharged = user.spent > 0 ? 1 : 0),
    need('calls_answered') && Call.countDocuments({ host: me, connectedAt: { $gte: since } }).then(n => (m.calls_answered = n)),
    need('live_minutes') &&
      Live.find({ owner: me, $or: [{ status: 'live' }, { endedAt: { $gte: since } }] }, { startedAt: 1, endedAt: 1 })
        .lean()
        .then(ls => {
          const now = Date.now()
          const secs = ls.reduce((n, l) => n + Math.max(0, ((l.endedAt ? l.endedAt.getTime() : now) - Math.max(l.startedAt.getTime(), since.getTime())) / 1000), 0)
          m.live_minutes = Math.floor(secs / 60)
        }),
    need('earned_inr') &&
      Earning.aggregate([
        { $match: { host: me, createdAt: { $gte: since }, source: { $ne: 'bonus' }, status: { $ne: 'reversed' } } },
        { $group: { _id: null, net: { $sum: '$net' } } },
      ]).then(([r]) => (m.earned_inr = Math.floor(r?.net || 0))),
  ])
  return m
}

async function board(user, list) {
  const active = list.filter(t => t.active)
  const [m, claims] = await Promise.all([
    metrics(user, new Set(active.map(t => t.metric))),
    TaskClaim.find({ user: user._id, taskId: { $in: active.map(t => t.id) } }, { taskId: 1, period: 1 }).lean(),
  ])
  const claimed = new Set(claims.map(c => `${c.taskId}|${c.period}`))
  return active.map(t => ({
    id: t.id,
    group: t.group,
    title: t.title,
    goal: t.goal,
    reward: t.reward,
    progress: Math.min(m[t.metric] || 0, t.goal),
    claimed: claimed.has(`${t.id}|${periodOf(t)}`),
  }))
}

const isHost = u => !!u.host?.approved && u.host.status === 'active'

export const tasksRoutes = Router()

tasksRoutes.get(
  '/',
  ah(async (req, res) => {
    const { tasks } = getConfig()
    res.json({
      user: await board(req.user, tasks.user),
      host: isHost(req.user) ? await board(req.user, tasks.host) : [],
    })
  }),
)

tasksRoutes.post(
  '/:id/claim',
  ah(async (req, res) => {
    const { tasks } = getConfig()
    const forHost = tasks.host.find(t => t.id === req.params.id && t.active)
    const t = forHost || tasks.user.find(t => t.id === req.params.id && t.active)
    if (!t) throw notFound('Task')
    if (forHost && !isHost(req.user)) throw notFound('Task')
    const m = await metrics(req.user, new Set([t.metric]))
    if ((m[t.metric] || 0) < t.goal) throw badRequest('Finish the task first.')
    const me = req.user._id
    const period = periodOf(t)
    try {
      const out = await withTxn(async s => {
        await TaskClaim.create([{ user: me, taskId: t.id, period, reward: t.reward }], { session: s })
        if (forHost) {
          const e = await recordEarning(me, { source: 'bonus', coins: t.reward, fromName: 'REBU', detail: `Daily task: ${t.title}` }, s)
          return { earned: e.net }
        }
        return { balance: await creditCoins(me, t.reward, { type: 'task_reward', title: `Task · ${t.title}`, meta: { taskId: t.id } }, s) }
      })
      res.status(201).json({ taskId: t.id, reward: t.reward, ...out })
    } catch (e) {
      if (e?.code === 11000) throw conflict('Already claimed.', 'already_claimed')
      throw e
    }
  }),
)
