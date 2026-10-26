import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'
import { forbidden, unauthorized } from './errors.js'

// Two token kinds share one secret but never each other's routes: `kind`
// is checked on every request.
export const signUserToken = user =>
  jwt.sign({ sub: String(user._id), kind: 'user' }, env.jwtSecret, { expiresIn: env.jwtExpiresIn })

export const signAdminToken = admin =>
  jwt.sign({ sub: String(admin._id), kind: 'admin', role: admin.role }, env.jwtSecret, { expiresIn: env.adminJwtExpiresIn })

export function verifyToken(token, kind) {
  try {
    const p = jwt.verify(token, env.jwtSecret)
    if (p.kind !== kind) throw new Error('wrong kind')
    return p
  } catch {
    throw unauthorized()
  }
}

const bearer = req => {
  const h = req.headers.authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7) : null
}

/** Loads req.user (a full User document) or 401s. Blocked accounts get 403. */
export function requireUser(User) {
  return async (req, res, next) => {
    try {
      const token = bearer(req)
      if (!token) throw unauthorized()
      const { sub } = verifyToken(token, 'user')
      const user = await User.findById(sub)
      if (!user) throw unauthorized()
      if (user.status === 'banned') throw forbidden('This account has been banned.')
      if (user.status === 'suspended' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
        throw forbidden('This account is suspended.')
      }
      req.user = user
      next()
    } catch (e) {
      next(e)
    }
  }
}

export function requireHost(req, res, next) {
  if (!req.user?.host?.approved) return next(forbidden('Only approved hosts can do this.'))
  if (req.user.host.status !== 'active') return next(forbidden('Your host account is suspended.'))
  next()
}

/** Admin auth + role check against the same sections as the admin panel. */
export function requireAdmin(Admin, section) {
  return async (req, res, next) => {
    try {
      const token = bearer(req)
      if (!token) throw unauthorized()
      const { sub } = verifyToken(token, 'admin')
      const admin = await Admin.findById(sub)
      if (!admin || admin.status !== 'active') throw unauthorized()
      if (section && !admin.can(section)) throw forbidden()
      req.admin = admin
      next()
    } catch (e) {
      next(e)
    }
  }
}
