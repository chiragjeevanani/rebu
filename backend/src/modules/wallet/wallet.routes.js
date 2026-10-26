import { Router } from 'express'
import { env } from '../../config/env.js'
import { z } from 'zod'
import { ah, paged, paging, parse } from '../../core/http.js'
import { badRequest } from '../../core/errors.js'
import { Payment } from './wallet.models.js'
import { User } from '../users/user.model.js'
import { confirmOrder, createPackOrder, createVipOrder, packsFor } from './wallet.service.js'

export const walletRoutes = Router()

const orderOut = p => ({
  id: String(p._id),
  packId: p.packId,
  kind: p.packId.startsWith('vip') ? 'vip' : 'coins',
  coins: p.coins,
  bonus: p.bonus,
  amount: p.amount,
  currency: p.currency,
  gateway: p.gateway,
  gatewayOrderId: p.gatewayOrderId,
  // What the app needs to open Razorpay checkout (key id is public).
  checkout: p.gateway === 'razorpay' ? { keyId: env.razorpay.keyId, orderId: p.gatewayOrderId, amount: Math.round(p.amount * 100), currency: p.currency, name: 'REBU' } : null,
  method: p.method,
  status: p.status,
  failureReason: p.failureReason,
  createdAt: p.createdAt,
})

walletRoutes.get(
  '/packs',
  ah(async (req, res) => {
    res.json({ balance: req.user.coins, packs: await packsFor(req.user._id) })
  }),
)

walletRoutes.post(
  '/orders',
  ah(async (req, res) => {
    const { packId } = parse(z.object({ packId: z.string().min(1).max(40) }), req.body)
    if (packId.startsWith('vip')) throw badRequest('Use /wallet/vip for VIP plans.')
    res.status(201).json({ order: orderOut(await createPackOrder(req.user._id, packId)) })
  }),
)

walletRoutes.post(
  '/vip',
  ah(async (req, res) => {
    const { level } = parse(z.object({ level: z.coerce.number().int().min(1) }), req.body)
    res.status(201).json({ order: orderOut(await createVipOrder(req.user._id, level)) })
  }),
)

/** Mock gateway callback. With Razorpay the body carries the signed payment ids. */
walletRoutes.post(
  '/orders/:id/confirm',
  ah(async (req, res) => {
    const body = parse(
      z.object({
        // Mock gateway: result. Razorpay: the three fields checkout returns.
        result: z.enum(['success', 'failed']).optional(),
        razorpay_payment_id: z.string().max(60).optional(),
        razorpay_order_id: z.string().max(60).optional(),
        razorpay_signature: z.string().max(200).optional(),
        method: z.string().max(30).optional(),
        failureReason: z.string().max(200).optional(),
      }),
      req.body,
    )
    const { order, applied } = await confirmOrder(req.user._id, req.params.id, {
      result: body.result || (body.razorpay_payment_id ? 'success' : undefined),
      method: body.method,
      failureReason: body.failureReason,
      gatewayPaymentId: body.razorpay_payment_id,
      signature: body.razorpay_signature,
    })
    const user = await User.findById(req.user._id, { coins: 1, vip: 1, spent: 1 })
    res.json({ order: orderOut(order), applied, balance: user.coins, vip: user.vip })
  }),
)

walletRoutes.get(
  '/orders',
  ah(async (req, res) => {
    const p = paging(req.query)
    const q = { user: req.user._id }
    const [items, total] = await Promise.all([
      Payment.find(q).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit),
      Payment.countDocuments(q),
    ])
    res.json(paged(items.map(orderOut), total, p))
  }),
)
