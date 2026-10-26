import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StoreContext } from './store-context'
import { makeSeed } from './seed'
import { api, errorText, getToken, setToken, setUnauthorizedHandler } from '../api/client'
import { connectAdminSocket, disconnectAdminSocket, onAdminEvent } from '../api/socket'

// Session, app config and sidebar counters come from the REBU backend.
// `db` is the old client-side mock, kept only for the few pieces the backend
// doesn't serve yet (see the TODO(api) notes in the pages that read it).
const DB_KEY = 'rebu.admin.db.v2'

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback()
  } catch {
    return fallback()
  }
}

let counter = 0
const newId = prefix =>
  `${prefix}${Date.now().toString(36).toUpperCase()}${(counter++).toString(36)}`

// Sidebar badges, from the dashboard's "needs attention" block.
const countsFrom = d => ({
  pendingApplications: d.attention?.pendingApplications || 0,
  withdrawalsRequested: d.attention?.withdrawalsRequested?.count || 0,
  openReports: d.attention?.openReports?.count || 0,
  openDisputes: d.attention?.openDisputes || 0,
  openTickets: d.attention?.openTickets || 0,
  liveNow: d.live?.activeLives || 0,
})

export default function StoreProvider({ children }) {
  const [db, setDb] = useState(() => load(DB_KEY, () => makeSeed()))
  const [me, setMe] = useState(null)
  const [config, setConfigState] = useState(null)
  const [configMeta, setConfigMeta] = useState({})
  const [counts, setCounts] = useState({})
  // 'checking' while a saved token is verified, then 'in' or 'out'.
  const [auth, setAuth] = useState(() => (getToken() ? 'checking' : 'out'))
  const [bootError, setBootError] = useState(null)
  const configRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(db))
      } catch {
        // Storage full or blocked — mock data stays in memory for this session.
      }
    }, 250)
    return () => clearTimeout(t)
  }, [db])

  const signOut = useCallback(() => {
    setToken(null)
    disconnectAdminSocket()
    setMe(null)
    setConfigState(null)
    setCounts({})
    setAuth('out')
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(signOut)
    return () => setUnauthorizedHandler(null)
  }, [signOut])

  // Load everything a signed-in session needs: who am I + app config.
  const fetchSession = () => Promise.all([api.get('/admin/me'), api.get('/admin/config')])
  const applySession = useCallback(([{ admin }, cfg]) => {
    configRef.current = cfg.config
    setConfigState(cfg.config)
    setConfigMeta(cfg.meta || {})
    setMe({ ...admin, id: admin.id || admin._id })
    setBootError(null)
    setAuth('in')
    connectAdminSocket(getToken())
  }, [])

  useEffect(() => {
    if (auth !== 'checking') return
    fetchSession().then(applySession).catch(e => {
      if (e.status === 401 || e.status === 403) signOut()
      else setBootError(errorText(e))
    })
  }, [auth, applySession, signOut])

  const retryBoot = useCallback(() => {
    setBootError(null)
    fetchSession().then(applySession).catch(e => setBootError(errorText(e)))
  }, [applySession])

  const refreshCounts = useCallback(() => {
    api.get('/admin/dashboard', { days: 7 }).then(d => setCounts(countsFrom(d)), () => {})
  }, [])

  // Badges: on sign-in, every minute, and when the server pushes something new.
  useEffect(() => {
    if (auth !== 'in') return
    let timer = null
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(refreshCounts, 400)
    }
    soon()
    const iv = setInterval(refreshCounts, 60000)
    const offs = ['report:new', 'support:new', 'live:started', 'live:ended'].map(ev => onAdminEvent(ev, soon))
    return () => {
      clearTimeout(timer)
      clearInterval(iv)
      offs.forEach(off => off())
    }
  }, [auth, refreshCounts])

  const login = useCallback(
    async (email, password) => {
      try {
        const { token } = await api.post('/auth/admin/login', { email: email.trim(), password })
        setToken(token)
        applySession(await fetchSession())
        return null
      } catch (e) {
        setToken(null)
        return errorText(e)
      }
    },
    [applySession],
  )

  const logout = signOut

  /**
   * Save one config key (economy, coinPacks, gifts, hostLevels, rateTiers,
   * vipTiers, royalClub, settings). `value` may be (old) => new. Resolves with
   * the saved value; rejects with an ApiError the page can show.
   */
  const setConfig = useCallback(async (key, value) => {
    const next = typeof value === 'function' ? value(configRef.current?.[key]) : value
    const res = await api.put(`/admin/config/${key}`, { value: next })
    configRef.current = { ...configRef.current, [key]: res.value }
    setConfigState(c => ({ ...c, [key]: res.value }))
    setConfigMeta(m => ({ ...m, [key]: { updatedBy: me?.name, updatedAt: new Date().toISOString() } }))
    return res.value
  }, [me])

  // ── Mock-only collections (no backend yet) ──────────────────────────────
  const update = useCallback((col, id, patch) => {
    setDb(d => ({
      ...d,
      [col]: d[col].map(item =>
        item.id === id ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item,
      ),
    }))
  }, [])

  const create = useCallback((col, item) => {
    const full = { id: item.id || newId(col.slice(0, 2).toUpperCase()), ...item }
    setDb(d => ({ ...d, [col]: [full, ...d[col]] }))
    return full
  }, [])

  const remove = useCallback((col, id) => {
    setDb(d => ({ ...d, [col]: d[col].filter(item => item.id !== id) }))
  }, [])

  const reset = useCallback(() => setDb(makeSeed()), [])

  // Pages read config as db.config, so overlay the server copy on the mock.
  const view = useMemo(() => (config ? { ...db, config } : db), [db, config])

  const value = useMemo(
    () => ({
      db: view,
      me,
      auth,
      bootError,
      retryBoot,
      configMeta,
      counts,
      refreshCounts,
      setConfig,
      update,
      create,
      remove,
      login,
      logout,
      reset,
    }),
    [view, me, auth, bootError, retryBoot, configMeta, counts, refreshCounts, setConfig, update, create, remove, login, logout, reset],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
