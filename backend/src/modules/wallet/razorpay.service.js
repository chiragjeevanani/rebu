// Razorpay over its REST API (no SDK needed). Key secret stays on the server;
// the app only ever gets the key id + an order id to open checkout with.
import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { ApiError, badRequest } from '../../core/errors.js'

const API = 'https://api.razorpay.com/v1'

export const razorpayEnabled = () => Boolean(env.razorpay.keyId && env.razorpay.keySecret)

async function call(method, path, body) {
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64')
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[razorpay]', method, path, res.status, json?.error?.description)
    throw new ApiError(502, 'payment_gateway_error', 'Payment service is unavailable. Please try again.')
  }
  return json
}

/** amount is ₹; Razorpay wants paise. */
export const createRzpOrder = ({ amount, receipt, notes }) =>
  call('POST', '/orders', { amount: Math.round(amount * 100), currency: 'INR', receipt, notes, payment_capture: 1 })

export const fetchRzpPayment = id => call('GET', `/payments/${encodeURIComponent(id)}`)

export const captureRzpPayment = (id, amountPaise) =>
  call('POST', `/payments/${encodeURIComponent(id)}/capture`, { amount: amountPaise, currency: 'INR' })

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a))
  const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

/** Checkout success handler signature: hmac(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  if (!safeEqual(expected, signature)) throw badRequest('Payment could not be verified.')
}

/** Webhook signature: hmac(raw body, webhook secret). */
export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return false
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex')
  return safeEqual(expected, signature || '')
}
