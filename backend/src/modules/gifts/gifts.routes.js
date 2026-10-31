import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { ah, parse } from '../../core/http.js'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { User } from '../users/user.model.js'
import { Call } from '../calls/call.model.js'
import { chargeUserPayHost, debitCoins, levelForGifts, withTxn } from '../wallet/economy.service.js'
import { addFamilyGift } from '../social/families.js'
import { notify } from '../notifications/notifications.js'
import { getConfig } from '../config/config.service.js'
import { toUser } from '../../core/realtime.js'
import { Live } from '../lives/live.model.js'
import { recordLiveGift } from '../lives/lives.service.js'
import { appendMessage, emitMessage, ensureConversation } from '../chat/chat.service.js'

export const giftsRoutes = Router()

const same = (a, b) => String(a) === String(b)
const activeGifts = () => getConfig().gifts.filter(g => g.active).sort((a, b) => a.order - b.order)
const publicGift = g => ({ key: g.key, name: g.name, emoji: g.emoji, coins: g.coins, fullScreen: !!g.fullScreen, category: g.category })

giftsRoutes.get(
  '/',
  ah(async (req, res) => {
    res.json({ items: activeGifts().map(publicGift) })
  }),
)

const objectId = z.string().refine(v => mongoose.isValidObjectId(v), 'Invalid id')

/**
 * Send a gift to a host during a call, live or chat. `quantity` sends several of
 * the SAME gift in one go (10 roses). A request is one gift type only: mixing
 * types in a bulk send (10 roses + 10 rockets) is rejected, they go separately.
 */
giftsRoutes.post(
  '/',
  ah(async (req, res) => {
    const { toId, giftKey, quantity, context } = parse(
      z
        .object({
          toId: objectId,
          giftKey: z.string().min(1),
          quantity: z.number().int().min(1).default(1),
          context: z.object({ type: z.enum(['call', 'live', 'chat']), id: objectId.optional() }),
        })
        .strict(),
      req.body,
    )
    const me = req.user
    const maxQty = getConfig().economy.maxGiftQuantity ?? 99
    if (quantity > maxQty) throw badRequest(`You can send up to ${maxQty} of a gift at a time.`, { max: maxQty })
    if (getConfig().settings.features?.gifts === false) throw forbidden('Gifts are turned off right now.')
    const gift = activeGifts().find(g => g.key === giftKey)
    if (!gift) throw notFound('Gift')
    const total = gift.coins * quantity
    const times = quantity > 1 ? ` ×${quantity}` : ''
    if (same(toId, me._id)) throw badRequest('You can’t send a gift to yourself.')
    const host = await User.findById(toId)
    if (!host || host.status !== 'active') throw notFound('Host')
    if (host.blocked?.some(id => same(id, me._id))) throw forbidden('You can’t send gifts to this host.')
    const isHost = !!host.host?.approved && host.host.status === 'active'

    // Context checks: a call gift needs a live call between the two; a live gift needs the live id.
    let call = null
    if (context.type === 'call' && context.id) {
      call = await Call.findById(context.id, { caller: 1, host: 1, status: 1 })
      if (!call || !same(call.caller, me._id) || !same(call.host, host._id)) throw notFound('Call')
      if (call.status !== 'connected') throw conflict('This call isn’t connected.', 'call_not_connected')
    }
    if (context.type === 'live') {
      if (!context.id) throw badRequest('Which live is this gift for?')
      // The recipient must be the live's owner or one of its guests.
      const live = await Live.findOne({ _id: context.id, status: 'live' }, { owner: 1, guests: 1, mode: 1 }).lean()
      if (!live) throw notFound('Live')
      const inLive = String(live.owner) === String(host._id) || live.guests?.some(g => String(g.user) === String(host._id))
      if (!inLive) throw badRequest('That host isn’t in this live.')
      // Rooms (party/audio) are open to everyone: a non-host owner or guest gets diamonds.
      if (!isHost && !['party', 'audio'].includes(live.mode)) throw notFound('Host')
    } else if (!isHost) throw notFound('Host')

    const conv = context.type === 'chat' ? await ensureConversation(me._id, host._id) : null
    const msgId = new mongoose.Types.ObjectId()
    const refKind = { call: 'Call', live: 'Live', chat: 'Message' }[context.type]
    const refId = context.type === 'chat' ? msgId : context.id

    const out = await withTxn(async s => {
      if (!isHost) {
        // Non-host in a room: REBU keeps the coins, the receiver gets diamonds (swappable for coins).
        const balance = await debitCoins(me._id, total, { type: 'gift', title: `Gift · ${gift.name}${times}`, ref: { kind: 'Live', id: context.id }, meta: { to: host._id, giftKey: gift.key, quantity } }, s)
        await User.updateOne({ _id: host._id }, { $inc: { diamonds: total } }, { session: s })
        return { balance, m: null }
      }
      const { balance } = await chargeUserPayHost(
        {
          userId: me._id,
          hostId: host._id,
          coins: total,
          source: 'gift',
          txnType: 'gift',
          title: `Gift · ${gift.name}${times}`,
          ref: refId ? { kind: refKind, id: refId } : undefined,
          detail: `${gift.emoji} ${gift.name}${times} (${context.type})`,
          fromName: me.name,
          meta: { giftKey: gift.key, quantity },
        },
        s,
      )
      if (call) await Call.updateOne({ _id: call._id }, { $inc: { giftCoins: total } }, { session: s })
      // Gift coins received decide the host's level.
      const h = await User.findOneAndUpdate({ _id: host._id }, { $inc: { 'host.giftCoins': total } }, { session: s, returnDocument: 'after', projection: { host: 1 } })
      const level = levelForGifts(h.host.giftCoins)
      if (!h.host.levelOverride && level !== h.host.level) await User.updateOne({ _id: host._id }, { $set: { 'host.level': level } }, { session: s })
      const m = conv
        ? await appendMessage(
          conv,
          { _id: msgId, from: me._id, to: host._id, type: 'gift', gift: { key: gift.key, name: gift.name, emoji: gift.emoji, coins: gift.coins, count: quantity }, cost: total },
          s,
        )
        : null
      return { balance, m }
    })

    const fullScreen = !!gift.fullScreen
    const shown = { ...publicGift(gift), count: quantity }
    const payload = { from: me.toPublic(), to: String(host._id), gift: shown, fullScreen, context, at: new Date() }
    // Lives keep diamond totals / top gifters and broadcast live:gift themselves.
    if (context.type === 'live') await recordLiveGift(context.id, me, { ...publicGift(gift), coins: total, count: quantity })
    else toUser(host._id, 'gift:received', payload)
    if (out.m) emitMessage(out.m, me)
    addFamilyGift(me._id, total).catch(() => {})
    if (context.type !== 'live') {
      notify(host._id, { kind: 'gift', title: `${me.name || 'Someone'} sent you ${gift.emoji} ${gift.name}${times}`, body: `${total} coins`, image: me.toPublic().photo, deeplink: `rebu://chat/${me._id}` })
    }

    res.status(201).json({ balance: out.balance, gift: shown, quantity, total, fullScreen })
  }),
)
