import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, Ban, Coins, RotateCcw, ShieldOff, UserX } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Seg,
  Select,
  Stat,
  Status,
  Tabs,
  Textarea,
  Who,
} from '../../components/ui'
import { ago, date, dateTime, duration, inr, label, num } from '../../utils/format'

function AdjustCoins({ open, user, onClose, onSave }) {
  const [mode, setMode] = useState('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Goodwill credit')
  const n = Math.max(0, Math.floor(Number(amount) || 0))
  const over = mode === 'deduct' && n > user.coins
  return (
    <Modal
      open={open}
      title="Adjust coins"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!n || over || !reason.trim()} onClick={() => onSave(mode === 'add' ? n : -n, reason.trim())}>
            {mode === 'add' ? `Add ${num(n)} coins` : `Deduct ${num(n)} coins`}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Seg
          options={[
            { value: 'add', label: 'Add coins' },
            { value: 'deduct', label: 'Deduct coins' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Field label="Coins" hint={`Current balance: ${num(user.coins)} coins`} error={over ? 'More than the user’s balance' : null}>
          <Input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason (shown in the audit log)">
          <Select
            value={reason}
            onChange={e => setReason(e.target.value)}
            options={['Goodwill credit', 'Failed payment — coins not credited', 'Call billing correction', 'Promotion / contest reward', 'Fraud reversal', 'Other']}
          />
        </Field>
      </div>
    </Modal>
  )
}

function Suspend({ open, onClose, onSave }) {
  const [days, setDays] = useState('7')
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      title="Suspend user"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => onSave(Number(days), reason.trim())}>
            Suspend
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Duration">
          <Select
            value={days}
            onChange={e => setDays(e.target.value)}
            options={[
              { value: '1', label: '24 hours' },
              { value: '7', label: '7 days' },
              { value: '30', label: '30 days' },
              { value: '0', label: 'Until reactivated' },
            ]}
          />
        </Field>
        <Field label="Reason (sent to the user)">
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Repeatedly asking hosts for contact details" />
        </Field>
      </div>
    </Modal>
  )
}

export default function UserDetailPage() {
  const { id } = useParams()
  const { db, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null) // coins | suspend | ban
  const u = db.users.find(x => x.id === id)
  const [notes, setNotes] = useState(u?.notes || '')

  const calls = useMemo(() => db.calls.filter(c => c.userId === id), [db.calls, id])
  const payments = useMemo(() => db.transactions.filter(t => t.userId === id), [db.transactions, id])
  const reports = useMemo(() => db.reports.filter(r => r.target.id === id || r.reporter.id === id), [db.reports, id])
  const history = useMemo(() => db.audit.filter(a => String(a.target).includes(id)), [db.audit, id])

  if (!u) {
    return (
      <Card>
        <Empty icon={UserX} title="User not found" text={`No user with ID ${id}.`} />
      </Card>
    )
  }

  const setStatus = (status, reason, extra = {}) => {
    update('users', u.id, { status, statusReason: reason || '', ...extra }, [
      `${status === 'active' ? 'Reactivated' : status === 'banned' ? 'Banned' : 'Suspended'} user${reason ? ` — ${reason}` : ''}`,
      u.id,
    ])
    toast(`${u.name} is now ${status}`)
  }

  const paidTotal = payments.filter(p => p.status === 'success').reduce((n, p) => n + p.amount, 0)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Users', to: '/admin/users' }, { label: u.name }]}
        title={
          <span className="a-row" style={{ gap: 14 }}>
            <Avatar src={u.avatar} name={u.name} size={52} />
            <span>
              <span className="a-row" style={{ gap: 8 }}>
                {u.name}
                {u.verified ? <BadgeCheck size={20} color="var(--info)" /> : null}
              </span>
              <span className="a-row" style={{ gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600 }}>
                <span className="a-mono a-muted">{u.id}</span>
                <Status value={u.status} />
                {u.vip ? <Badge tone="warning">{u.vip >= 4 ? 'VIP Elite' : `VIP ${u.vip}`}</Badge> : null}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <Button icon={Coins} onClick={() => setModal('coins')}>
              Adjust coins
            </Button>
            <Button icon={BadgeCheck} onClick={() => update('users', u.id, { verified: !u.verified }, [u.verified ? 'Removed verification' : 'Verified profile', u.id])}>
              {u.verified ? 'Unverify' : 'Verify'}
            </Button>
            {u.status === 'active' ? (
              <>
                <Button icon={ShieldOff} onClick={() => setModal('suspend')}>
                  Suspend
                </Button>
                <Button variant="soft-danger" icon={Ban} onClick={() => setModal('ban')}>
                  Ban
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={RotateCcw} onClick={() => setStatus('active')}>
                Reactivate
              </Button>
            )}
          </>
        }
      />

      {u.status !== 'active' && u.statusReason ? (
        <div className="a-card" style={{ padding: 14, marginBottom: 16, background: 'var(--danger-soft)', borderColor: 'transparent', boxShadow: 'none' }}>
          <b className="a-danger">{label(u.status)}</b>
          <span className="a-muted">
            {' '}
            — {u.statusReason}
            {u.suspendedUntil ? ` · until ${date(u.suspendedUntil)}` : ''}
          </span>
        </div>
      ) : null}

      <div className="a-grid c4" style={{ marginBottom: 20 }}>
        <Stat label="Coin balance" value={num(u.coins)} icon={Coins} />
        <Stat label="Total spent" value={inr(u.spent)} sub={(n => `${n} successful payment${n === 1 ? '' : 's'}`)(payments.filter(p => p.status === 'success').length)} />
        <Stat label="Calls" value={num(calls.length || u.calls)} sub={`${num(Math.round(calls.reduce((n, c) => n + c.duration, 0) / 60))} min in sample`} />
        <Stat label="Reports" value={reports.filter(r => r.target.id === id).length} sub="against this user" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'calls', label: 'Calls', count: calls.length },
          { value: 'payments', label: 'Payments', count: payments.length },
          { value: 'reports', label: 'Reports', count: reports.length },
          { value: 'history', label: 'Admin history' },
        ]}
      />

      {tab === 'overview' ? (
        <div className="a-grid c2">
          <Card title="Profile">
            <dl className="a-dl">
              <dt>Phone</dt>
              <dd>{u.phone}</dd>
              <dt>Email</dt>
              <dd>{u.email || '—'}</dd>
              <dt>Gender · age</dt>
              <dd>
                {u.gender} · {u.age}
              </dd>
              <dt>City</dt>
              <dd>{u.city}</dd>
              <dt>Device</dt>
              <dd>{u.device}</dd>
              <dt>Joined</dt>
              <dd>{dateTime(u.joined)}</dd>
              <dt>Last active</dt>
              <dd>{ago(u.lastActive)}</dd>
            </dl>
          </Card>
          <Card
            title="Internal notes"
            subtitle="Only visible to admins"
            actions={
              <Button
                size="sm"
                variant="primary"
                disabled={notes === (u.notes || '')}
                onClick={() => {
                  update('users', u.id, { notes }, ['Updated notes', u.id])
                  toast('Notes saved')
                }}
              >
                Save
              </Button>
            }
          >
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add context for other admins…" style={{ minHeight: 170 }} />
          </Card>
        </div>
      ) : null}

      {tab === 'calls' ? (
        <Card padded={false}>
          <DataTable
            rows={calls}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'host', label: 'Host', render: c => <Who src={c.hostAvatar} name={c.hostName} sub={c.id} to={`/admin/hosts/${c.hostId}`} /> },
              { key: 'type', label: 'Type', render: c => label(c.type) },
              { key: 'ts', label: 'When', sort: c => c.ts, render: c => dateTime(c.ts) },
              { key: 'duration', label: 'Duration', align: 'right', sort: c => c.duration, render: c => duration(c.duration) },
              { key: 'coins', label: 'Coins', align: 'right', sort: c => c.coins, render: c => num(c.coins) },
              { key: 'status', label: 'Status', render: c => <Status value={c.status} /> },
            ]}
            empty={<Empty title="No calls yet" />}
          />
        </Card>
      ) : null}

      {tab === 'payments' ? (
        <Card padded={false} subtitle={`${inr(paidTotal)} paid in total`}>
          <DataTable
            rows={payments}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'id', label: 'Payment', render: t => <span className="a-mono">{t.id}</span> },
              { key: 'ts', label: 'When', sort: t => t.ts, render: t => dateTime(t.ts) },
              { key: 'coins', label: 'Coins', align: 'right', render: t => `${num(t.coins)}${t.bonus ? ` + ${num(t.bonus)}` : ''}` },
              { key: 'amount', label: 'Amount', align: 'right', sort: t => t.amount, render: t => <b className="a-strong">{inr(t.amount)}</b> },
              { key: 'method', label: 'Method' },
              { key: 'status', label: 'Status', render: t => <Status value={t.status} /> },
            ]}
            empty={<Empty title="No payments yet" />}
          />
        </Card>
      ) : null}

      {tab === 'reports' ? (
        <Card padded={false}>
          <DataTable
            rows={reports}
            columns={[
              { key: 'dir', label: '', render: r => <Badge tone={r.target.id === id ? 'danger' : 'info'}>{r.target.id === id ? 'Against user' : 'Filed by user'}</Badge> },
              { key: 'reason', label: 'Reason', render: r => <b className="a-strong">{r.reason}</b> },
              { key: 'other', label: 'Other party', render: r => (r.target.id === id ? r.reporter.name : r.target.name) },
              { key: 'ts', label: 'When', render: r => ago(r.ts) },
              { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
            ]}
            empty={<Empty title="No reports" />}
          />
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card padded={false}>
          {history.length === 0 ? (
            <Empty title="No admin actions yet" />
          ) : (
            history.map(a => (
              <div key={a.id} className="a-list-row">
                <span style={{ flex: 1 }}>
                  <b className="a-strong">{a.action}</b>
                  <span className="a-small a-muted" style={{ display: 'block' }}>
                    by {a.admin}
                  </span>
                </span>
                <span className="a-small a-muted">{dateTime(a.ts)}</span>
              </div>
            ))
          )}
        </Card>
      ) : null}

      <AdjustCoins
        key={modal === 'coins' ? 'open' : 'closed'}
        open={modal === 'coins'}
        user={u}
        onClose={() => setModal(null)}
        onSave={(delta, reason) => {
          update('users', u.id, x => ({ coins: x.coins + delta }), [`${delta > 0 ? 'Added' : 'Deducted'} ${num(Math.abs(delta))} coins — ${reason}`, u.id])
          toast(`${delta > 0 ? 'Added' : 'Deducted'} ${num(Math.abs(delta))} coins`)
          setModal(null)
        }}
      />
      <Suspend
        key={modal === 'suspend' ? 's-open' : 's-closed'}
        open={modal === 'suspend'}
        onClose={() => setModal(null)}
        onSave={(days, reason) => {
          setStatus('suspended', reason, { suspendedUntil: days ? Date.now() + days * 86400000 : null })
          setModal(null)
        }}
      />
      <Confirm
        open={modal === 'ban'}
        title={`Ban ${u.name}?`}
        message="They’ll be signed out and can’t create a new account with this phone number."
        confirmLabel="Ban user"
        danger
        reason
        onClose={() => setModal(null)}
        onConfirm={reason => {
          setStatus('banned', reason)
          setModal(null)
        }}
      />
    </>
  )
}
