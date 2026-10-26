// Razorpay → server notifications and a dev-only test checkout page.
import express, { Router } from 'express'
import { env } from '../../config/env.js'
import { Payment } from './wallet.models.js'
import { confirmOrder, settleFromWebhook } from './wallet.service.js'
import { verifyWebhookSignature } from './razorpay.service.js'

export const paymentsWebhook = Router()

// Must see the raw body to check the signature, so it's mounted before express.json().
paymentsWebhook.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!verifyWebhookSignature(req.body, req.get('x-razorpay-signature'))) {
    return res.status(400).json({ error: { code: 'bad_signature', message: 'Invalid signature' } })
  }
  try {
    const evt = JSON.parse(req.body.toString('utf8'))
    const pay = evt.payload?.payment?.entity
    if (pay && (evt.event === 'payment.captured' || evt.event === 'order.paid')) {
      await settleFromWebhook({ gatewayOrderId: pay.order_id, paymentId: pay.id, method: pay.method })
    } else if (pay && evt.event === 'payment.failed') {
      await settleFromWebhook({ gatewayOrderId: pay.order_id, paymentId: pay.id, method: pay.method, failed: true, reason: pay.error_description })
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('[razorpay webhook]', e)
    res.status(500).json({ ok: false })
  }
})

// Checkout "redirect" mode (used inside the app's WebView, where bank/OTP
// pop-ups can't open): Razorpay posts the result here as a form, we verify and
// settle, then send the WebView to /done, which the app intercepts.
paymentsWebhook.post('/razorpay/callback', express.urlencoded({ extended: true }), async (req, res) => {
  const b = req.body || {}
  let orderId = b.razorpay_order_id
  if (!orderId && b['error[metadata]']) {
    try {
      orderId = JSON.parse(b['error[metadata]']).order_id
    } catch {
      orderId = null
    }
  }
  const p = orderId ? await Payment.findOne({ gatewayOrderId: orderId }) : null
  let status = 'failed'
  let message = b['error[description]'] || 'Payment failed.'
  try {
    if (p && b.razorpay_payment_id && b.razorpay_signature) {
      const r = await confirmOrder(p.user, p._id, {
        result: 'success',
        gatewayPaymentId: b.razorpay_payment_id,
        signature: b.razorpay_signature,
      })
      status = r.order.status
      message = ''
    } else if (p) {
      await confirmOrder(p.user, p._id, { result: 'failed', failureReason: message })
    }
  } catch (e) {
    message = e.message
  }
  const q = new URLSearchParams({ status, order: p ? String(p._id) : '', message })
  res.redirect(303, `/api/webhooks/razorpay/done?${q}`)
})

paymentsWebhook.get('/razorpay/done', (req, res) => {
  const ok = req.query.status === 'success'
  res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width">
<body style="font-family:system-ui;text-align:center;padding:40px">${ok ? 'Payment successful' : 'Payment not completed'}</body>`)
})

// Dev-only: open an order in Razorpay's real (test-mode) checkout in a browser,
// so the full pay → verify → credit loop can be tried before the app has it.
export const devCheckout = Router()

devCheckout.get('/checkout/:id', async (req, res) => {
  const p = await Payment.findById(req.params.id).lean()
  if (!p || p.gateway !== 'razorpay') return res.status(404).send('Order not found')
  res.set('content-security-policy', '') // allow Razorpay's script on this page only
  res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width">
<body style="font-family:system-ui;padding:24px">
<h3>REBU test checkout</h3><p>${p.coins + (p.bonus || 0)} coins · ₹${p.amount} · status <b id="s">${p.status}</b></p>
<button id="pay" style="padding:12px 20px;font-size:16px">Pay ₹${p.amount}</button>
<p style="color:#666">Test card 4111 1111 1111 1111 · any future expiry · any CVV · OTP 1111 (or use UPI success@razorpay)</p>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
document.getElementById('pay').onclick = () => new Razorpay({
  key: ${JSON.stringify(env.razorpay.keyId)}, order_id: ${JSON.stringify(p.gatewayOrderId)},
  amount: ${Math.round(p.amount * 100)}, currency: 'INR', name: 'REBU',
  handler: r => fetch(location.pathname + '/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) })
    .then(x => x.json()).then(j => { document.getElementById('s').textContent = j.order ? j.order.status + (j.applied ? ' (credited)' : '') : JSON.stringify(j) })
}).open()
</script></body>`)
})

devCheckout.post('/checkout/:id/confirm', express.json(), async (req, res, next) => {
  try {
    const p = await Payment.findById(req.params.id)
    if (!p) return res.status(404).json({ error: 'not found' })
    const out = await confirmOrder(p.user, p._id, {
      result: 'success',
      gatewayPaymentId: req.body.razorpay_payment_id,
      signature: req.body.razorpay_signature,
    })
    res.json(out)
  } catch (e) {
    next(e)
  }
})
