import { useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Minus, Power, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { Badge, Button, Card, Confirm, DataTable, ErrorState, Field, Input, Modal, PageHeader, Select, Status, Who } from '../../components/ui'
import { ago } from '../../utils/format'
import { NAV, ROLES } from '../../routes/nav'

const ROLE_TONE = { super_admin: 'brand', moderator: 'violet', finance: 'success', support: 'info' }
const ROLE_OPTIONS = Object.entries(ROLES).map(([value, r]) => ({ value, label: r.label }))
const roleLabel = role => ROLES[role]?.label || role

// One row per permission section. Sections with several pages use the group title.
const SECTIONS = (() => {
  const map = new Map()
  for (const group of NAV) {
    for (const item of group.items) {
      const s = map.get(item.section)
      if (s) s.pages.push(item.label)
      else map.set(item.section, { key: item.section, group: group.title, pages: [item.label] })
    }
  }
  return [...map.values()].map(s => ({ ...s, label: s.pages.length > 1 ? s.group : s.pages[0] }))
})()

const can = (role, section) => ROLES[role].sections === '*' || ROLES[role].sections.includes(section)

function InviteModal({ open, admins, onClose, onInvite }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('moderator')
  const [created, setCreated] = useState(null) // { name, email, password }
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const e = email.trim().toLowerCase()
  const emailError = !e
    ? null
    : !/^\S+@\S+\.\S+$/.test(e)
      ? 'Enter a valid email'
      : admins.some(a => a.email.toLowerCase() === e)
        ? 'An admin with this email already exists'
        : null
  const valid = name.trim() && e && !emailError && !busy

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`REBU admin\nEmail: ${created.email}\nTemporary password: ${created.password}`)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (created) {
    return (
      <Modal
        open={open}
        title="Admin invited"
        onClose={onClose}
        footer={
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="a-stack">
          <p className="a-muted">
            Share these sign-in details with <b className="a-strong">{created.name}</b> over a private channel. The password is shown only once.
          </p>
          <dl className="a-dl">
            <dt>Email</dt>
            <dd>{created.email}</dd>
            <dt>Role</dt>
            <dd>{roleLabel(created.role)}</dd>
            <dt>Temporary password</dt>
            <dd>
              <span className="a-mono a-strong" style={{ fontSize: 15, letterSpacing: 0.5 }}>{created.password}</span>
            </dd>
          </dl>
          <Button icon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Copied' : 'Copy sign-in details'}
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      title="Invite admin"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={UserPlus}
            disabled={!valid}
            onClick={async () => {
              setBusy(true)
              // The server generates the temporary password and returns it once.
              const r = await onInvite({ name: name.trim(), email: e, role })
              setBusy(false)
              if (r) setCreated({ name: r.admin.name, email: r.admin.email, role: r.admin.role, password: r.tempPassword })
            }}
          >
            Invite
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Full name">
          <Input value={name} onChange={ev => setName(ev.target.value)} placeholder="Priya Nair" autoFocus />
        </Field>
        <Field label="Work email" error={emailError}>
          <Input type="email" value={email} onChange={ev => setEmail(ev.target.value)} placeholder="name@rebu.app" />
        </Field>
        <Field label="Role" hint={ROLES[role].sections === '*' ? 'Full access, including settings and admins.' : `Can open: ${SECTIONS.filter(s => can(role, s.key)).map(s => s.label).join(', ')}`}>
          <Select value={role} onChange={ev => setRole(ev.target.value)} options={ROLE_OPTIONS} />
        </Field>
        <div className="a-row a-small a-muted">
          <KeyRound size={15} /> A temporary password is generated when you invite.
        </div>
      </div>
    </Modal>
  )
}

export default function AdminsPage() {
  const { me } = useStore()
  const toast = useToast()
  const res = useApi('/admin/admins')
  const admins = useMemo(() => res.data?.items || [], [res.data])
  const fail = e => toast(errorText(e), 'error')
  const replace = a => res.setData(d => ({ ...d, items: d.items.map(x => (x.id === a.id ? a : x)) }))
  const [inviting, setInviting] = useState(false)
  const [confirm, setConfirm] = useState(null) // { kind: 'disable'|'remove', admin }

  const activeSupers = useMemo(() => admins.filter(a => a.role === 'super_admin' && a.status === 'active'), [admins])

  // Why an action is blocked for this admin, or null when it's allowed.
  const lock = a => {
    if (a.id === me?.id) return 'You can’t change your own account'
    if (a.role === 'super_admin' && a.status === 'active' && activeSupers.length <= 1) return 'The last active super admin can’t be changed'
    return null
  }

  const changeRole = async (a, role) => {
    if (role === a.role) return
    try {
      const { admin } = await api.patch(`/admin/admins/${a.id}`, { role })
      replace(admin)
      toast(`${a.name} is now ${roleLabel(role)}`)
    } catch (e) {
      fail(e)
    }
  }

  const setStatus = async (a, status) => {
    try {
      const { admin } = await api.post(`/admin/admins/${a.id}/status`, { status })
      replace(admin)
      toast(`${a.name} ${status === 'active' ? 'can sign in again' : 'is disabled'}`)
    } catch (e) {
      fail(e)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Admin',
      sort: a => a.name,
      render: a => (
        <span className="a-row" style={{ gap: 8 }}>
          <Who src={a.avatar} name={a.name} sub={a.email} />
          {a.id === me?.id ? <Badge tone="ink">You</Badge> : null}
        </span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sort: a => a.role,
      render: a => <Badge tone={ROLE_TONE[a.role] || 'neutral'}>{roleLabel(a.role)}</Badge>,
    },
    { key: 'status', label: 'Status', sort: a => a.status, render: a => <Status value={a.status} /> },
    {
      key: 'lastLogin',
      label: 'Last sign-in',
      sort: a => a.lastLogin || 0,
      render: a => <span className="a-muted a-nowrap">{a.lastLogin ? ago(a.lastLogin) : 'Never'}</span>,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: a => {
        const why = lock(a)
        return (
          <span className="a-row" style={{ gap: 6, justifyContent: 'flex-end' }} title={why || undefined}>
            <Select
              value={a.role}
              disabled={!!why}
              onChange={e => changeRole(a, e.target.value)}
              options={ROLE_OPTIONS}
              aria-label={`Role for ${a.name}`}
              style={{ width: 140, height: 32 }}
            />
            {a.status === 'active' ? (
              <Button size="sm" icon={Power} disabled={!!why} onClick={() => setConfirm({ kind: 'disable', admin: a })}>
                Disable
              </Button>
            ) : (
              <Button size="sm" icon={Power} disabled={a.id === me?.id} onClick={() => setStatus(a, 'active')}>
                Enable
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={Trash2}
              disabled={!!why}
              onClick={() => setConfirm({ kind: 'remove', admin: a })}
              aria-label={`Remove ${a.name}`}
            />
          </span>
        )
      },
    },
  ]

  const roles = Object.keys(ROLES)

  return (
    <>
      <PageHeader
        title="Admins & roles"
        subtitle={`${admins.length} admins · ${admins.filter(a => a.status === 'active').length} active · ${activeSupers.length} super admin${activeSupers.length === 1 ? '' : 's'}`}
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>
            Invite admin
          </Button>
        }
      />

      <Card title="Team" padded={false} style={{ marginBottom: 20 }}>
        {res.error && !res.data ? (
          <ErrorState error={res.error} onRetry={res.reload} />
        ) : (
          <DataTable rows={admins} columns={columns} loading={res.loading} initialSort={{ key: 'name', dir: 'asc' }} />
        )}
      </Card>

      <Card title="Roles & permissions" subtitle="Which sections of the admin panel each role can open." padded={false}>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Section</th>
                {roles.map(r => (
                  <th key={r} style={{ textAlign: 'center' }}>
                    {roleLabel(r)}
                    <div className="a-faint" style={{ fontWeight: 600, textTransform: 'none' }}>
                      {admins.filter(a => a.role === r).length} admin{admins.filter(a => a.role === r).length === 1 ? '' : 's'}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map(s => (
                <tr key={s.key}>
                  <td>
                    <b className="a-strong">{s.label}</b>
                    {s.pages.length > 1 ? <div className="a-small a-muted">{s.pages.join(' · ')}</div> : null}
                  </td>
                  {roles.map(r => (
                    <td key={r} style={{ textAlign: 'center' }}>
                      {can(r, s.key) ? (
                        <Check size={18} color="var(--success)" aria-label="Allowed" />
                      ) : (
                        <Minus size={16} color="var(--faint)" aria-label="No access" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="a-card-foot a-row a-small a-muted">
          <ShieldCheck size={15} /> Roles are fixed for now. Ask engineering to add a custom role.
        </div>
      </Card>

      {inviting ? (
        <InviteModal
          open
          admins={admins}
          onClose={() => setInviting(false)}
          onInvite={async body => {
            try {
              const r = await api.post('/admin/admins', body)
              res.setData(d => ({ ...d, items: [...d.items, r.admin], total: d.total + 1 }))
              toast(`${body.name} invited`)
              return r
            } catch (e) {
              fail(e)
              return null
            }
          }}
        />
      ) : null}

      <Confirm
        open={!!confirm}
        title={confirm?.kind === 'remove' ? `Remove ${confirm?.admin.name}?` : `Disable ${confirm?.admin.name}?`}
        message={
          confirm?.kind === 'remove'
            ? 'They lose access immediately and the account is deleted. Their past actions stay in the audit log.'
            : 'They are signed out and can’t sign in until you enable them again.'
        }
        confirmLabel={confirm?.kind === 'remove' ? 'Remove admin' : 'Disable'}
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const a = confirm.admin
          setConfirm(null)
          if (confirm.kind === 'remove') {
            try {
              await api.del(`/admin/admins/${a.id}`)
              res.setData(d => ({ ...d, items: d.items.filter(x => x.id !== a.id), total: d.total - 1 }))
              toast(`${a.name} removed`)
            } catch (e) {
              fail(e)
            }
          } else {
            await setStatus(a, 'disabled')
          }
        }}
      />
    </>
  )
}
