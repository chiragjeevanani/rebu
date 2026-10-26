import { Router } from 'express'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { conflict, forbidden } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { Call } from './call.model.js'
import {
  acceptCall,
  endCall,
  loadParticipantCall,
  rateCall,
  shapeCall,
  startCall,
  startRandomCall,
} from './calls.service.js'
import { rtcToken } from '../agora/agora.service.js'

export const callsRoutes = Router()

const callType = z.enum(['video', 'voice'])
const same = (a, b) => String(a) === String(b)

/** Start a call to a host → { call, host, agora } (caller's token). */
callsRoutes.post(
  '/',
  ah(async (req, res) => {
    const body = parse(z.object({ hostId: z.string().min(1), type: callType, random: z.boolean().optional() }), req.body)
    res.status(201).json(await startCall(req.user, { hostId: body.hostId, type: body.type, random: body.random }))
  }),
)

/** Random match with any free, affordable host. */
callsRoutes.post(
  '/random',
  ah(async (req, res) => {
    const { type } = parse(z.object({ type: callType }), req.body)
    res.status(201).json(await startRandomCall(req.user, type))
  }),
)

/** My call history (as caller or host), newest first. */
callsRoutes.get(
  '/',
  ah(async (req, res) => {
    const q = parse(z.object({ role: z.enum(['caller', 'host']).optional(), status: z.string().optional() }).loose(), req.query)
    const pg = paging(req.query)
    const me = req.user._id
    const filter = q.role === 'caller' ? { caller: me } : q.role === 'host' ? { host: me } : { $or: [{ caller: me }, { host: me }] }
    if (q.status) filter.status = { $in: q.status.split(',') }
    const [rows, total] = await Promise.all([
      Call.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
      Call.countDocuments(filter),
    ])
    const otherIds = rows.map(c => (same(c.caller, me) ? c.host : c.caller))
    const users = await User.find({ _id: { $in: otherIds } })
    const byId = new Map(users.map(u => [String(u._id), u.toPublic()]))
    const items = rows.map(c => {
      const other = same(c.caller, me) ? c.host : c.caller
      return { ...shapeCall(c, me), other: byId.get(String(other)) || null }
    })
    res.json(paged(items, total, pg))
  }),
)

callsRoutes.get(
  '/:id',
  ah(async (req, res) => {
    const call = await loadParticipantCall(req.params.id, req.user._id)
    const otherId = same(call.caller, req.user._id) ? call.host : call.caller
    const other = await User.findById(otherId)
    res.json({ call: shapeCall(call, req.user._id), other: other?.toPublic() || null })
  }),
)

/** Host picks up → { call, agora } (host's token); billing starts. */
callsRoutes.post(
  '/:id/accept',
  ah(async (req, res) => {
    await loadParticipantCall(req.params.id, req.user._id)
    res.json(await acceptCall(req.params.id, req.user))
  }),
)

/** Ring-phase transitions and hang-up share one shape. */
function transition({ who, from, reason, message }) {
  return ah(async (req, res) => {
    const call = await loadParticipantCall(req.params.id, req.user._id)
    if (who === 'host' && !same(call.host, req.user._id)) throw forbidden('Only the host can do this.')
    if (who === 'caller' && !same(call.caller, req.user._id)) throw forbidden('Only the caller can do this.')
    if (call.status !== from) throw conflict(message, `call_not_${from}`)
    const out = await endCall(call._id, { reason, by: req.user._id })
    if (!out) {
      // Lost a race (e.g. ring timeout or the other side ended first): return the final state.
      const cur = await Call.findById(call._id)
      return res.json({ call: shapeCall(cur, req.user._id), alreadyEnded: true })
    }
    res.json({ call: shapeCall(out.call, req.user._id) })
  })
}

callsRoutes.post('/:id/decline', transition({ who: 'host', from: 'ringing', reason: 'declined', message: 'This call is no longer ringing.' }))
callsRoutes.post('/:id/cancel', transition({ who: 'caller', from: 'ringing', reason: 'cancelled', message: 'This call is no longer ringing.' }))
callsRoutes.post('/:id/end', transition({ who: 'any', from: 'connected', reason: 'hangup', message: 'This call isn’t connected.' }))

/** Caller rates the host after the call. */
callsRoutes.post(
  '/:id/rate',
  ah(async (req, res) => {
    const { stars } = parse(z.object({ stars: z.number().int().min(1).max(5) }), req.body)
    const call = await rateCall(req.params.id, req.user._id, stars)
    res.json({ call: shapeCall(call, req.user._id) })
  }),
)

/** Token renewal for an active participant. */
callsRoutes.post(
  '/:id/token',
  ah(async (req, res) => {
    const call = await loadParticipantCall(req.params.id, req.user._id)
    const ok = call.status === 'connected' || (call.status === 'ringing' && same(call.caller, req.user._id))
    if (!ok) throw conflict('This call isn’t active.', 'call_not_active')
    res.json({ agora: rtcToken({ channel: call.channel, userId: req.user._id, role: 'publisher' }) })
  }),
)
