// Thin fetch wrapper for the REBU backend. In dev VITE_API_URL is unset and
// requests go through the Vite proxy (/api, /uploads, /socket.io).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const TOKEN_KEY = 'rebu.admin.token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Private mode — the session lasts until the tab closes.
  }
}

// Called once per 401 so the store can sign out to the login page.
let onUnauthorized = null
export const setUnauthorizedHandler = fn => {
  onUnauthorized = fn
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

/** First field error if the backend sent one, else the message. */
export function errorText(e) {
  if (!e) return ''
  const d = Array.isArray(e.details) ? e.details[0] : null
  if (d?.message) return d.path ? `${d.path}: ${d.message}` : d.message
  return e.message || 'Something went wrong.'
}

function qs(query) {
  if (!query) return ''
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** `file` sends a File/Blob as the raw request body with its own content-type. */
export async function request(path, { method = 'GET', body, file, query, signal } = {}) {
  const token = getToken()
  const headers = {}
  if (file) headers['content-type'] = file.type
  else if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${API_BASE}/api${path}${qs(query)}`, {
      method,
      headers,
      body: file || (body === undefined ? undefined : JSON.stringify(body)),
      signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new ApiError(0, 'network', 'Can’t reach the REBU server. Check your connection.')
  }
  const text = await res.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const err = data?.error || {}
    if (res.status === 401 && token) onUnauthorized?.()
    throw new ApiError(res.status, err.code || 'http_error', err.message || `Request failed (${res.status})`, err.details)
  }
  return data
}

export const api = {
  get: (path, query, opts) => request(path, { ...opts, query }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
  /** Raw image upload (JPEG/PNG/WebP, ≤ 8 MB) → { url }. */
  upload: (path, file, opts) => request(path, { ...opts, method: 'POST', file }),
}

export { qs as toQuery }
