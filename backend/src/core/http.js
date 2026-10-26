import { ZodError } from 'zod'
import { ApiError, badRequest } from './errors.js'

/** Wraps an async route handler so thrown errors reach the error middleware. */
export const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Validate with a zod schema; throws a 400 with field errors. */
export function parse(schema, data) {
  const r = schema.safeParse(data)
  if (!r.success) {
    throw badRequest('Some fields are invalid.', r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })))
  }
  return r.data
}

/** Pagination from ?page&limit (limit capped at 100). */
export function paging(query) {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  return { page, limit, skip: (page - 1) * limit }
}

export const paged = (items, total, { page, limit }) => ({ items, total, page, limit, pages: Math.ceil(total / limit) })

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: `No route ${req.method} ${req.path}` } })
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) err = badRequest('Some fields are invalid.', err.issues)
  if (err?.name === 'CastError') err = badRequest(`Invalid ${err.path}`)
  if (err?.code === 11000) err = new ApiError(409, 'duplicate', 'That already exists.', err.keyValue)
  if (!(err instanceof ApiError)) {
    console.error('[error]', err)
    err = new ApiError(500, 'server_error', 'Something went wrong. Please try again.')
  }
  res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } })
}
