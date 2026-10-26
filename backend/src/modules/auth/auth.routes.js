import { Router } from 'express'
import crypto from 'node:crypto'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { ah, parse } from '../../core/http.js'
import { ApiError, badRequest, forbidden } from '../../core/errors.js'
import { signAdminToken, signUserToken } from '../../core/auth.js'
import { User } from '../users/user.model.js'
import { Admin } from '../admins/admin.model.js'
import { creditCoins } from '../wallet/economy.service.js'
import { getConfig } from '../config/config.service.js'

// OTP codes live here briefly (hashed); a TTL index cleans them up.
const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
})
const Otp = mongoose.models.Otp || mongoose.model('Otp', otpSchema)

const hash = s => crypto.createHash('sha256').update(s).digest('hex')
// Indian mobile numbers: 10 digits starting 6-9 (the demo number is allowed too).
const phoneSchema = z.string().trim().transform(s => s.replace(/\D/g, '').slice(-10)).refine(
  s => /^[6-9]\d{9}$/.test(s) || s === env.demoPhone,
  'Enter a valid 10-digit mobile number',
)

/** Sends the OTP by SMS. "mock" just logs it (dev). */
async function deliverOtp(phone, code) {
  if (env.otpProvider === 'mock') {
    console.log(`[otp] ${phone} → ${code}`)
    return
  }
  let r
  if (env.otpProvider === 'msg91') {
    // DLT-approved template with a ##OTP## variable.
    r = await fetch('https://control.msg91.com/api/v5/flow', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authkey: env.msg91.authKey },
      body: JSON.stringify({ template_id: env.msg91.templateId, short_url: '0', recipients: [{ mobiles: `91${phone}`, OTP: code }] }),
    })
  } else if (env.otpProvider === 'twilio') {
    const { sid, token, from } = env.twilio
    r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `+91${phone}`, From: from, Body: `${code} is your REBU code. It expires in ${Math.round(getConfig().settings.otp.expirySecs / 60)} minutes. Don’t share it.` }),
    })
  } else {
    throw new Error(`Unknown OTP_PROVIDER ${env.otpProvider}`)
  }
  if (!r.ok) {
    console.error('[otp] SMS failed', env.otpProvider, r.status, (await r.text()).slice(0, 200))
    throw new ApiError(502, 'sms_failed', 'We couldn’t send the code right now. Please try again in a minute.')
  }
}

const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false })

export const authRoutes = Router()

authRoutes.post(
  '/otp/send',
  otpLimiter,
  ah(async (req, res) => {
    const { phone } = parse(z.object({ phone: phoneSchema }), req.body)
    const { otp } = getConfig().settings
    // Fixed codes, no SMS: the dev demo number, and the app-store reviewer number set in the admin panel.
    const fixed = phone === env.demoPhone && env.demoOtp ? env.demoOtp : otp.testNumber && phone === otp.testNumber && otp.testOtp ? otp.testOtp : null
    const isDemo = !!fixed
    const code = fixed || String(crypto.randomInt(10 ** (otp.length - 1), 10 ** otp.length))
    await Otp.deleteMany({ phone })
    await Otp.create({ phone, codeHash: hash(code), expiresAt: new Date(Date.now() + otp.expirySecs * 1000) })
    if (!isDemo) await deliverOtp(phone, code)
    res.json({
      ok: true,
      resendAfter: otp.resendSecs,
      // Dev convenience only — never in production.
      devCode: !env.isProd && env.otpProvider === 'mock' ? code : undefined,
    })
  }),
)

authRoutes.post(
  '/otp/verify',
  ah(async (req, res) => {
    const { phone, code } = parse(z.object({ phone: phoneSchema, code: z.string().trim().min(4).max(8) }), req.body)
    const row = await Otp.findOne({ phone })
    if (!row) throw badRequest('Code expired. Request a new one.')
    if (row.attempts >= 5) {
      await row.deleteOne()
      throw badRequest('Too many wrong attempts. Request a new code.')
    }
    if (row.codeHash !== hash(code)) {
      row.attempts += 1
      await row.save()
      throw badRequest('Wrong code. Try again.')
    }
    await row.deleteOne()

    let user = await User.findOne({ phone })
    let isNew = false
    if (!user) {
      user = await User.create({ phone })
      isNew = true
      const gift = getConfig().economy.newUserCoins
      if (gift > 0) await creditCoins(user._id, gift, { type: 'signup_bonus', title: 'Welcome gift' })
      user = await User.findById(user._id)
    }
    if (user.status === 'banned') throw forbidden('This account has been banned.')
    user.lastActive = new Date()
    await user.save()
    res.json({ token: signUserToken(user), isNew, user: user.toSelf() })
  }),
)

const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false })

authRoutes.post(
  '/admin/login',
  adminLimiter,
  ah(async (req, res) => {
    const { email, password } = parse(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body)
    const admin = await Admin.findOne({ email: email.toLowerCase() })
    if (!admin || !(await admin.checkPassword(password))) throw badRequest('Wrong email or password.')
    if (admin.status !== 'active') throw forbidden('This admin account is disabled.')
    admin.lastLogin = new Date()
    await admin.save()
    res.json({ token: signAdminToken(admin), admin })
  }),
)
