import { useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Minus, Power, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, DataTable, Field, Input, Modal, PageHeader, Select, Status, Who } from '../../components/ui'
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

function makePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(12))
  return Array.from(bytes, b => chars[b % chars.length]).join('').replace(/^(.{4})(.{4})(.{4})$/, '$1-$2-$3')
}

function InviteModal({ open, admins, onClose, onInvite }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('moderator')
  const [created, setCreated] = useState(null) // { name, email, password }
  const [copied, setCopied] = useState(false)

  const e = email.trim().toLowerCase()
  const emailError = !e
    ? null
    : !/^\S+@\S+\.\S+$/.test(e)
      ? 'Enter a valid email'
      : admins.some(a => a.email.toLowerCase() === e)
        ? 'An admin with this email already exists'
        : null
  const valid = name.trim() && e && !emailError

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
            onClick={() => {
              const password = makePassword()
              onInvite({ name: name.trim(), email: e, role, password })
              setCreated({ name: name.trim(), email: e, role, password })
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
  const { db, me, update, create, remove, log } = useStore()
  const toast = useToast()
  const [inviting, setInviting] = useState(false)
  const [confirm, setConfirm] = useState(null) // { kind: 'disable'|'remove', admin }

  const activeSupers = useMemo(() => db.admins.filter(a => a.role === 'super_admin' && a.status === 'active'), [db.admins])

  // Why an action is blocked for this admin, or null when it's allowed.
  const lock = a => {
    if (a.id === me?.id) return 'You can’t change your own account'
    if (a.role === 'super_admin' && a.status === 'active' && activeSupers.length <= 1) return 'The last active super admin can’t be changed'
    return null
  }

  const changeRole = (a, role) => {
    if (role === a.role) return
    update('admins', a.id, { role }, [`Changed role ${roleLabel(a.role)} → ${roleLabel(role)} for ${a.name}`, a.id])
    toast(`${a.name} is now ${roleLabel(role)}`)
  }

  const setStatus = (a, status) => {
    update('admins', a.id, { status }, [`${status === 'active' ? 'Enabled' : 'Disabled'} admin ${a.name}`, a.id])
    toast(`${a.name} ${status === 'active' ? 'can sign in again' : 'is disabled'}`)
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
        subtitle={`${db.admins.length} admins · ${db.admins.filter(a => a.status === 'active').length} active · ${activeSupers.length} super admin${activeSupers.length === 1 ? '' : 's'}`}
        actions={
          <Button variant="primary" icon={UserPlus} onClick={() => setInviting(true)}>
            Invite admin
          </Button>
        }
      />

      <Card title="Team" padded={false} style={{ marginBottom: 20 }}>
        <DataTable rows={db.admins} columns={columns} initialSort={{ key: 'name', dir: 'asc' }} />
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
                      {db.admins.filter(a => a.role === r).length} admin{db.admins.filter(a => a.role === r).length === 1 ? '' : 's'}
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
          admins={db.admins}
          onClose={() => setInviting(false)}
          onInvite={({ name, email, role, password }) => {
            const a = create('admins', {
              name,
              email,
              password,
              role,
              status: 'active',
              lastLogin: null,
              avatar: `https://i.pravatar.cc/200?img=${1 + Math.floor(Math.random() * 70)}`,
            })
            log(`Invited ${name} as ${roleLabel(role)}`, a.id)
            toast(`${name} invited`)
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
        onConfirm={() => {
          const a = confirm.admin
          if (confirm.kind === 'remove') {
            remove('admins', a.id, [`Removed admin ${a.name} (${roleLabel(a.role)})`, a.id])
            toast(`${a.name} removed`)
          } else {
            setStatus(a, 'disabled')
          }
          setConfirm(null)
        }}
      />
    </>
  )
}
