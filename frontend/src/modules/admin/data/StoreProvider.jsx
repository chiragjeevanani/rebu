import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StoreContext } from './store-context'
import { makeSeed } from './seed'

// Everything is kept in the browser until the REBU backend exists. Each action
// below is the single place where the matching API call will go.
const DB_KEY = 'rebu.admin.db.v2'
const SESSION_KEY = 'rebu.admin.session.v1'

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback()
  } catch {
    return fallback()
  }
}

const entry = (admin, action, target) => ({
  id: newId('LG'),
  ts: Date.now(),
  admin: admin || 'System',
  action,
  target: target || '',
})

// Optional audit = [action, target] recorded alongside a change.
const withAudit = (d, admin, audit) =>
  audit ? { audit: [entry(admin, audit[0], audit[1]), ...d.audit].slice(0, 500) } : {}

let counter = 0
const newId = prefix =>
  `${prefix}${Date.now().toString(36).toUpperCase()}${(counter++).toString(36)}`

export default function StoreProvider({ children }) {
  const [db, setDb] = useState(() => load(DB_KEY, () => makeSeed()))
  const [session, setSession] = useState(() => load(SESSION_KEY, () => null))
  const meRef = useRef(null)

  const me = useMemo(
    () => (session ? db.admins.find(a => a.id === session.adminId) || null : null),
    [session, db.admins],
  )
  useEffect(() => {
    meRef.current = me
  }, [me])

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(db))
      } catch {
        // Storage full or blocked — data stays in memory for this session.
      }
    }, 250)
    return () => clearTimeout(t)
  }, [db])

  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  const log = useCallback((action, target) => {
    setDb(d => ({ ...d, audit: [entry(meRef.current?.name, action, target), ...d.audit].slice(0, 500) }))
  }, [])

  const update = useCallback((col, id, patch, audit) => {
    setDb(d => ({
      ...d,
      [col]: d[col].map(item =>
        item.id === id
          ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) }
          : item,
      ),
      ...withAudit(d, meRef.current?.name, audit),
    }))
  }, [])

  const create = useCallback((col, item, audit) => {
    const full = { id: item.id || newId(col.slice(0, 2).toUpperCase()), ...item }
    setDb(d => ({ ...d, [col]: [full, ...d[col]], ...withAudit(d, meRef.current?.name, audit) }))
    return full
  }, [])

  const remove = useCallback((col, id, audit) => {
    setDb(d => ({
      ...d,
      [col]: d[col].filter(item => item.id !== id),
      ...withAudit(d, meRef.current?.name, audit),
    }))
  }, [])

  const setConfig = useCallback((key, value, audit) => {
    setDb(d => ({
      ...d,
      config: {
        ...d.config,
        [key]: typeof value === 'function' ? value(d.config[key]) : value,
      },
      ...withAudit(d, meRef.current?.name, audit),
    }))
  }, [])

  const login = useCallback(
    (email, password) => {
      const a = db.admins.find(
        x => x.email.toLowerCase() === email.trim().toLowerCase(),
      )
      if (!a || a.password !== password) return 'Wrong email or password.'
      if (a.status !== 'active') return 'This admin account is disabled.'
      setSession({ adminId: a.id, at: Date.now() })
      setDb(d => ({
        ...d,
        admins: d.admins.map(x => (x.id === a.id ? { ...x, lastLogin: Date.now() } : x)),
      }))
      return null
    },
    [db.admins],
  )

  const logout = useCallback(() => setSession(null), [])

  const reset = useCallback(() => {
    setDb(makeSeed())
  }, [])

  const value = useMemo(
    () => ({ db, me, update, create, remove, setConfig, log, login, logout, reset }),
    [db, me, update, create, remove, setConfig, log, login, logout, reset],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
