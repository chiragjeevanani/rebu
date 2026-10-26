import { Router } from 'express'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import {
  acceptRequest,
  cancelRequest,
  declineRequest,
  endLive,
  getLiveDetail,
  getSummary,
  joinLive,
  leaveLive,
  listLives,
  muteGuest,
  removeGuest,
  renewToken,
  requestJoin,
  sendChat,
  startLive,
} from './lives.service.js'

// Lives (live / premium) and rooms (party / audio). Mounted at /api/lives
// behind requireUser, so req.user is always set.
export const livesRoutes = Router()

const MODES = ['live', 'premium', 'party', 'audio']

const startSchema = z.object({
  mode: z.enum(MODES),
  title: z.string().trim().min(1).max(80),
  cover: z.string().trim().max(500).optional(),
  ticket: z.union([z.literal(50), z.literal(100), z.literal(200), z.literal(500)]).optional(),
  allowGuests: z.boolean().optional(),
  commentsFrom: z.enum(['everyone', 'followers', 'nobody']).optional(),
  welcome: z.string().trim().max(200).optional(),
  category: z.string().trim().max(40).optional(),
  replace: z.boolean().optional(),
})

livesRoutes.post(
  '/',
  ah(async (req, res) => {
    res.status(201).json(await startLive(req.user, parse(startSchema, req.body)))
  }),
)

livesRoutes.get(
  '/',
  ah(async (req, res) => {
    const { mode } = parse(z.object({ mode: z.string().optional() }), req.query)
    const modes = mode ? mode.split(',').map(s => s.trim()).filter(Boolean) : []
    parse(z.array(z.enum(MODES)), modes)
    const pg = paging(req.query)
    const { items, total } = await listLives({ modes, ...pg })
    res.json(paged(items, total, pg))
  }),
)

livesRoutes.get('/:id', ah(async (req, res) => res.json({ live: await getLiveDetail(req.params.id, req.user) })))
livesRoutes.get('/:id/summary', ah(async (req, res) => res.json(await getSummary(req.params.id, req.user))))

livesRoutes.post('/:id/join', ah(async (req, res) => res.json(await joinLive(req.params.id, req.user))))
livesRoutes.post('/:id/leave', ah(async (req, res) => res.json(await leaveLive(req.params.id, req.user))))
livesRoutes.post('/:id/token', ah(async (req, res) => res.json(await renewToken(req.params.id, req.user))))
livesRoutes.post('/:id/end', ah(async (req, res) => res.json(await endLive(req.params.id, req.user))))

livesRoutes.post(
  '/:id/chat',
  ah(async (req, res) => {
    const { text } = parse(z.object({ text: z.string().trim().min(1).max(300) }), req.body)
    res.json(await sendChat(req.params.id, req.user, text))
  }),
)

// Join requests: video guest in live/premium, a seat in party/audio.
livesRoutes.post(
  '/:id/requests',
  ah(async (req, res) => {
    const { seat } = parse(z.object({ seat: z.number().int().min(0).optional() }), req.body || {})
    res.json(await requestJoin(req.params.id, req.user, seat))
  }),
)
livesRoutes.delete('/:id/requests', ah(async (req, res) => res.json(await cancelRequest(req.params.id, req.user))))
livesRoutes.post(
  '/:id/requests/:userId/accept',
  ah(async (req, res) => res.json(await acceptRequest(req.params.id, req.user, req.params.userId))),
)
livesRoutes.post(
  '/:id/requests/:userId/decline',
  ah(async (req, res) => res.json(await declineRequest(req.params.id, req.user, req.params.userId))),
)

livesRoutes.post(
  '/:id/guests/:userId/remove',
  ah(async (req, res) => res.json(await removeGuest(req.params.id, req.user, req.params.userId))),
)
livesRoutes.post(
  '/:id/guests/:userId/mute',
  ah(async (req, res) => {
    const { muted } = parse(z.object({ muted: z.boolean().optional() }), req.body || {})
    res.json(await muteGuest(req.params.id, req.user, req.params.userId, muted))
  }),
)
