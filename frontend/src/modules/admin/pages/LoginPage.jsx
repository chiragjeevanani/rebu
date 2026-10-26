import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { ROLES } from '../routes/nav'
import { Button, Field, Input } from '../components/ui'

export default function LoginPage() {
  const { db, login } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState(null)

  const submit = e => {
    e.preventDefault()
    setError(login(email, password))
  }

  return (
    <div className="a-login">
      <div className="a-login-art">
        <div className="a-row" style={{ gap: 12 }}>
          <img src="/rebu_logo.jpeg" alt="" style={{ width: 44, height: 44, borderRadius: 12 }} />
          <b style={{ fontSize: 20, letterSpacing: 1 }}>REBU</b>
        </div>
        <div>
          <h2>Run every part of REBU from one place.</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: 14, maxWidth: 420 }}>
            Users, hosts, calls, lives, payments, payouts, pricing and safety — with role-based access for your team.
          </p>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12.5 }}>© REBU · Admin console</div>
      </div>

      <div className="a-login-form">
        <form onSubmit={submit} className="a-stack">
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)' }}>Sign in</h1>
            <p className="a-muted" style={{ marginTop: 4 }}>
              Use your REBU admin account.
            </p>
          </div>
          <Field label="Email">
            <Input icon={Mail} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" error={error}>
            <span className="a-input-wrap">
              <LockKeyhole size={16} />
              <input
                className="a-input"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShow(s => !s)}
                className="a-btn ghost icon sm"
                style={{ position: 'absolute', right: 3 }}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </Field>
          <Button type="submit" variant="primary" size="lg" block>
            Sign in
          </Button>

          <div className="a-card" style={{ padding: 14, background: 'var(--surface-2)', boxShadow: 'none' }}>
            <div className="a-label" style={{ marginBottom: 8 }}>
              Demo accounts (test build)
            </div>
            {db.admins.slice(0, 4).map(a => (
              <button
                key={a.id}
                type="button"
                className="a-btn ghost block"
                style={{ justifyContent: 'space-between', height: 32 }}
                onClick={() => {
                  setEmail(a.email)
                  setPassword(a.password)
                  setError(null)
                }}
              >
                <span>{ROLES[a.role]?.label}</span>
                <span className="a-mono a-muted">{a.email}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </div>
  )
}
