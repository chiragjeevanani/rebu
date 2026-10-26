import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import morgan from 'morgan'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './core/http.js'
import { requireUser } from './core/auth.js'
import { User } from './modules/users/user.model.js'
import { publicConfig } from './modules/config/config.service.js'
import { agoraConfigured } from './modules/agora/agora.service.js'
import { razorpayEnabled } from './modules/wallet/razorpay.service.js'
import { authRoutes } from './modules/auth/auth.routes.js'
import { meRoutes } from './modules/users/users.routes.js'
import { walletRoutes } from './modules/wallet/wallet.routes.js'
import { hostsRoutes } from './modules/hosts/hosts.routes.js'
import { hostRoutes } from './modules/hosts/host.routes.js'
import { callsRoutes } from './modules/calls/calls.routes.js'
import { chatRoutes } from './modules/chat/chat.routes.js'
import { livesRoutes } from './modules/lives/lives.routes.js'
import { giftsRoutes } from './modules/gifts/gifts.routes.js'
import { reportsRoutes } from './modules/reports/reports.routes.js'
import { adminRoutes, publicContentRoutes } from './modules/admin/admin.routes.js'
import { devCheckout, paymentsWebhook } from './modules/wallet/payments.webhook.js'
import { hostSim } from './modules/dev/host-sim.js'
import { viewerSim } from './modules/dev/viewer-sim.js'
import { notificationsRoutes } from './modules/notifications/notifications.js'
import { momentsRoutes } from './modules/moments/moments.js'
import { storeRoutes } from './modules/social/store.js'
import { tasksRoutes } from './modules/social/tasks.js'
import { familiesRoutes } from './modules/social/families.js'
import { extrasRoutes } from './modules/social/extras.js'
import { UPLOAD_DIR, uploadsRoutes } from './modules/uploads/uploads.routes.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // API responses are per-user and live; never let clients send 304s back.
  app.set('etag', false)
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins.length ? env.corsOrigins : true }))
  // Webhooks verify signatures over the raw body, so they come before JSON parsing.
  app.use('/api/webhooks', paymentsWebhook)
  app.use(express.json({ limit: '1mb' }))
  if (!env.isProd) app.use(morgan('dev'))

  // Uploaded images (cross-origin so the admin panel can show them).
  app.use('/uploads', (req, res, next) => {
    res.set('cross-origin-resource-policy', 'cross-origin')
    next()
  }, express.static(UPLOAD_DIR, { maxAge: '7d' }))
  app.get('/health', (req, res) => res.json({ ok: true, agora: agoraConfigured(), razorpay: razorpayEnabled() }))
  if (!env.isProd) app.use('/dev', devCheckout, hostSim, viewerSim)

  const api = express.Router()
  // Public
  api.use('/auth', authRoutes)
  api.get('/config', (req, res) => res.json(publicConfig()))
  api.use('/content', publicContentRoutes) // live banners, policy pages
  // Signed-in users (and hosts — a host is a user with an approved host block)
  const user = requireUser(User)
  api.use('/me', user, meRoutes)
  api.use('/uploads', user, uploadsRoutes)
  api.use('/wallet', user, walletRoutes)
  api.use('/hosts', user, hostsRoutes) // browse hosts
  api.use('/host', user, hostRoutes) // host's own center, application, earnings
  api.use('/calls', user, callsRoutes)
  api.use('/chats', user, chatRoutes)
  api.use('/lives', user, livesRoutes)
  api.use('/gifts', user, giftsRoutes)
  api.use('/reports', user, reportsRoutes)
  api.use('/notifications', user, notificationsRoutes)
  api.use('/moments', user, momentsRoutes)
  api.use('/store', user, storeRoutes) // items, VIP, royal club, diamonds
  api.use('/tasks', user, tasksRoutes)
  api.use('/families', user, familiesRoutes)
  api.use('/social', user, extrasRoutes) // leaderboard, visitors, greetings
  // Admin panel (own auth inside)
  api.use('/admin', adminRoutes)

  app.use('/api', (req, res, next) => {
    res.set('cache-control', 'no-store')
    next()
  }, api)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
