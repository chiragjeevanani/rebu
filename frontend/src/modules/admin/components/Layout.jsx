import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { NAV, ROLES, canAccess } from '../routes/nav'
import { useStore } from '../hooks/useStore'
import { useTheme } from '../hooks/useTheme'
import { Avatar, Button } from './ui'

function GlobalSearch() {
  const { db, me } = useStore()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef(null)

  useEffect(() => {
    const h = e => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        box.current?.querySelector('input')?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const hit = (...vals) => vals.some(v => String(v || '').toLowerCase().includes(t))
    const out = []
    if (canAccess(me.role, 'users'))
      db.users.filter(u => hit(u.name, u.id, u.phone, u.email)).slice(0, 5)
        .forEach(u => out.push({ key: u.id, label: u.name, sub: `User · ${u.id} · ${u.phone}`, avatar: u.avatar, to: `/admin/users/${u.id}` }))
    if (canAccess(me.role, 'hosts'))
      db.hosts.filter(h => hit(h.name, h.id, h.phone)).slice(0, 5)
        .forEach(h => out.push({ key: h.id, label: h.name, sub: `Host · ${h.id} · Lv ${h.level}`, avatar: h.avatar, to: `/admin/hosts/${h.id}` }))
    if (canAccess(me.role, 'calls'))
      db.calls.filter(c => hit(c.id)).slice(0, 3)
        .forEach(c => out.push({ key: c.id, label: c.id, sub: `Call · ${c.userName} → ${c.hostName}`, to: `/admin/calls?q=${c.id}` }))
    return out
  }, [q, db, me.role])

  const go = to => {
    setQ('')
    setOpen(false)
    navigate(to)
  }

  return (
    <div ref={box} style={{ position: 'relative', flex: 1, maxWidth: 440 }}>
      <span className="a-input-wrap">
        <Search size={16} />
        <input
          className="a-input"
          placeholder="Search users, hosts, call IDs…"
          value={q}
          onChange={e => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => e.key === 'Enter' && results[0] && go(results[0].to)}
        />
        <span className="a-input-affix">
          <span className="a-kbd">/</span>
        </span>
      </span>
      {open && q.trim().length >= 2 ? (
        <div className="a-card" style={{ position: 'absolute', top: 44, left: 0, right: 0, zIndex: 50, padding: 6, boxShadow: 'var(--shadow-lg)' }}>
          {results.length === 0 ? (
            <div className="a-muted" style={{ padding: 12 }}>
              No matches for “{q}”
            </div>
          ) : (
            results.map(r => (
              <button
                key={r.key}
                type="button"
                className="a-btn ghost block"
                style={{ justifyContent: 'flex-start', height: 'auto', padding: 8 }}
                onMouseDown={() => go(r.to)}
              >
                <Avatar src={r.avatar} name={r.label} size={30} />
                <span style={{ textAlign: 'left' }}>
                  <span className="a-strong" style={{ display: 'block' }}>
                    {r.label}
                  </span>
                  <span className="a-small a-muted" style={{ fontWeight: 500 }}>
                    {r.sub}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export default function Layout() {
  const { db, me, logout } = useStore()
  const { theme, setTheme } = useTheme()
  const [navOpen, setNavOpen] = useState(false)
  const [menu, setMenu] = useState(false)

  const groups = NAV.map(g => ({
    ...g,
    items: g.items.filter(i => canAccess(me.role, i.section)),
  })).filter(g => g.items.length)

  return (
    <div className="a-shell">
      <aside className={`a-sidebar ${navOpen ? 'open' : ''}`}>
        <div className="a-brand">
          <img src="/rebu_logo.jpeg" alt="" />
          <div>
            <b>REBU</b>
            <span>Admin console</span>
          </div>
        </div>
        <nav className="a-nav" aria-label="Admin">
          {groups.map(g => (
            <div key={g.title} className="a-nav-group">
              <div className="a-nav-title">{g.title}</div>
              {g.items.map(i => {
                const n = i.badge ? i.badge(db) : 0
                return (
                  <NavLink key={i.to} to={i.to} end={i.end} className="a-nav-link" onClick={() => setNavOpen(false)}>
                    <i.icon size={18} />
                    {i.label}
                    {n ? <span className="a-count">{n}</span> : null}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className={`a-scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />

      <div className="a-main">
        <header className="a-topbar">
          <Button className="a-menu-btn" variant="ghost" iconOnly icon={Menu} onClick={() => setNavOpen(true)} aria-label="Open menu" />
          <GlobalSearch />
          <span className="a-spacer" />
          <Button
            variant="ghost"
            iconOnly
            icon={theme === 'dark' ? Sun : Moon}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle dark mode"
          />
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="a-btn ghost"
              style={{ height: 44, paddingLeft: 6 }}
              onClick={() => setMenu(m => !m)}
              onBlur={() => setTimeout(() => setMenu(false), 150)}
            >
              <Avatar src={me.avatar} name={me.name} size={32} />
              <span className="a-me-text" style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <span className="a-strong" style={{ display: 'block' }}>
                  {me.name}
                </span>
                <span className="a-small a-muted" style={{ fontWeight: 600 }}>
                  {ROLES[me.role]?.label}
                </span>
              </span>
            </button>
            {menu ? (
              <div className="a-card" style={{ position: 'absolute', right: 0, top: 50, width: 220, padding: 6, zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
                <div className="a-small a-muted" style={{ padding: '6px 10px' }}>
                  {me.email}
                </div>
                <Button variant="ghost" block icon={LogOut} style={{ justifyContent: 'flex-start' }} onMouseDown={logout}>
                  Sign out
                </Button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="a-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
