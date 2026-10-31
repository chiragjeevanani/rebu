// Coin-pack and VIP orders: create order → app opens Razorpay checkout →
// signature-verified confirm (or webhook) credits once. Without Razorpay keys
// the gateway is mocked so flows can be tested locally.
import { User } from '../users/user.model.js'
import { Payment } from './wallet.models.js'
import { creditCoins, withTxn } from './economy.service.js'
import { getConfig } from '../config/config.service.js'
import { badRequest, notFound } from '../../core/errors.js'
import {
  captureRzpPayment,
  createRzpOrder,
  fetchRzpPayment,
  razorpayEnabled,
  verifyCheckoutSignature,
} from './razorpay.service.js'

const DAY = 864e5
export const isVip = p => p.packId.startsWith('vip')

/** Packs the user can buy now (first-recharge offers only before any purchase). */
export async function packsFor(userId) {
  const { coinPacks } = getConfig()
  const paid = await Payment.exists({ user: userId, status: 'success' })
  return coinPacks.filter(p => p.active && !(paid && p.firstRecharge))
}

async function createOrder(userId, { packId, coins, bonus, amount }) {
  const gateway = razorpayEnabled() ? 'razorpay' : 'mock'
  const p = new Payment({ user: userId, packId, coins, bonus, amount, gateway })
  if (gateway === 'razorpay') {
    const o = await createRzpOrder({ amount, receipt: String(p._id), notes: { userId: String(userId), packId } })
    p.gatewayOrderId = o.id
  } else {
    p.gatewayOrderId = `mock_${p._id}`
  }
  await p.save()
  return p
}

export async function createPackOrder(userId, packId) {
  const pack = (await packsFor(userId)).find(p => p.id === packId)
  if (!pack) throw badRequest('That coin pack is not available.')
  return createOrder(userId, { packId: pack.id, coins: pack.coins, bonus: pack.bonus || 0, amount: pack.price })
}

export async function createVipOrder(userId, level) {
  const tier = getConfig().vipTiers.find(t => t.level === level && t.active)
  if (!tier) throw badRequest('That VIP plan is not available.')
  return createOrder(userId, { packId: `vip${tier.level}`, coins: 0, bonus: 0, amount: tier.price })
}

/**
 * Settle an order once. The created → success/failed switch is a conditional
 * update inside the transaction, so a repeated or concurrent confirm finds
 * nothing to update and credits nothing. Returns { order, applied }.
 */
export async function confirmOrder(userId, orderId, { result, method, gatewayPaymentId, failureReason, signature }) {
  const order = await Payment.findOne({ _id: orderId, user: userId })
  if (!order) throw notFound('Order')
  // Real payments are only ever settled from Razorpay's word, never the app's.
  if (order.gateway === 'razorpay') {
    if (result === 'failed') return markFailed(orderId, { method, failureReason })
    return confirmRazorpay(order, { paymentId: gatewayPaymentId, signature })
  }
  return settle(orderId, { result, method, gatewayPaymentId, failureReason })
}

async function markFailed(orderId, { method, failureReason }) {
  const p = await Payment.findOneAndUpdate(
    { _id: orderId, status: 'created' },
    { status: 'failed', method, failureReason: failureReason || 'Payment failed' },
    { returnDocument: 'after' },
  )
  return p ? { order: p, applied: true } : { order: await Payment.findById(orderId), applied: false }
}

/** Verify checkout signature + ask Razorpay the payment's real status/amount. */
async function confirmRazorpay(order, { paymentId, signature }) {
  if (!paymentId || !signature) throw badRequest('Missing payment details.')
  verifyCheckoutSignature({ orderId: order.gatewayOrderId, paymentId, signature })
  let pay = await fetchRzpPayment(paymentId)
  if (pay.order_id !== order.gatewayOrderId || pay.amount !== Math.round(order.amount * 100)) {
    throw badRequest('Payment does not match this order.')
  }
  if (pay.status === 'authorized') pay = await captureRzpPayment(paymentId, pay.amount)
  if (pay.status !== 'captured') throw badRequest(`Payment is ${pay.status}.`)
  return settle(order._id, { result: 'success', method: pay.method, gatewayPaymentId: paymentId })
}

/** Webhook path (payment.captured / order.paid): settle by gateway order id. */
export async function settleFromWebhook({ gatewayOrderId, paymentId, method, failed, reason }) {
  const order = await Payment.findOne({ gatewayOrderId })
  if (!order) return { applied: false }
  if (failed) return markFailed(order._id, { method, failureReason: reason })
  return settle(order._id, { result: 'success', method, gatewayPaymentId: paymentId })
}

// The single place an order flips to success/failed. Whichever of confirm or
// webhook arrives first wins; the other is a no-op.
async function settle(orderId, { result, method, gatewayPaymentId, failureReason }) {

  if (result === 'failed') return markFailed(orderId, { method, failureReason })

  return withTxn(async s => {
    const p = await Payment.findOneAndUpdate(
      { _id: orderId, status: 'created' },
      { status: 'success', method, gatewayPaymentId: gatewayPaymentId || `mockpay_${orderId}` },
      { returnDocument: 'after', session: s },
    )
    if (!p) return { order: await Payment.findById(orderId).session(s), applied: false }
    const userId = p.user

    if (isVip(p)) {
      const level = Number(p.packId.slice(3))
      const days = getConfig().vipTiers.find(t => t.level === level)?.days || 30
      const u = await User.findById(userId, { vip: 1 }).session(s)
      // Extend from the current expiry if still active, else from now.
      const from = u.vip?.until && u.vip.until > new Date() ? u.vip.until.getTime() : Date.now()
      await User.updateOne(
        { _id: userId },
        { $set: { vip: { level: Math.max(level, u.vip?.until > new Date() ? u.vip.level : 0), until: new Date(from + days * DAY) } }, $inc: { spent: p.amount } },
        { session: s },
      )
    } else {
      await creditCoins(
        userId,
        p.coins + (p.bonus || 0),
        { type: 'purchase', title: `Bought ${p.coins} coins${p.bonus ? ` + ${p.bonus} bonus` : ''}`, ref: { kind: 'Payment', id: p._id }, meta: { packId: p.packId, amount: p.amount } },
        s,
      )
      await User.updateOne({ _id: userId }, { $inc: { spent: p.amount, coinsBought: p.coins + (p.bonus || 0) } }, { session: s })
    }
    return { order: p, applied: true }
  })
}
