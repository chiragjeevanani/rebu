import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BadgeCheck, Ban, Check, Coins, RotateCcw, ShieldOff, UserX, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { canAccess } from '../../routes/nav'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pending,
  Seg,
  Select,
  Stat,
  Status,
  Tabs,
  Textarea,
  Who,
} from '../../components/ui'
import { FrameChip } from '../../components/LevelChips'
import { frameOf } from '../../utils/levels'
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

const callStatus = s => (s === 'ended' ? 'completed' : s === 'connected' || s === 'ringing' ? 'ongoing' : s)
const deviceText = d => (d && typeof d === 'object' ? [d.platform, d.model, d.appVersion && `v${d.appVersion}`].filter(Boolean).join(' · ') : d) || '—'

export default function UserDetailPage() {
  const { id } = useParams()
  const res = useApi(`/admin/users/${id}`)
  if (res.error?.status === 404 || res.error?.status === 400) {
    return (
      <Card>
        <Empty icon={UserX} title="User not found" text={`No user with ID ${id}.`} />
      </Card>
    )
  }
  return <Pending res={res}>{d => <UserDetail d={d} reload={res.reload} />}</Pending>
}

function Notes({ user, onSaved }) {
  const toast = useToast()
  const [notes, setNotes] = useState(user.notes || '')
  const [busy, setBusy] = useState(false)
  return (
    <Card
      title="Internal notes"
      subtitle="Only visible to admins"
      actions={
        <Button
          size="sm"
          variant="primary"
          disabled={busy || notes === (user.notes || '')}
          onClick={async () => {
            setBusy(true)
            try {
              await api.patch(`/admin/users/${user.id}`, { notes })
              toast('Notes saved')
              onSaved()
            } catch (e) {
              toast(errorText(e), 'error')
            }
            setBusy(false)
          }}
        >
          Save
        </Button>
      }
    >
      <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add context for other admins…" style={{ minHeight: 170 }} />
    </Card>
  )
}

/** Pending blue-tick request: the selfie beside the profile photos, approve or reject. */
function VerificationRequest({ user: u, onDecide }) {
  const [busy, setBusy] = useState(false)
  const decide = async ok => {
    setBusy(true)
    await onDecide(ok)
    setBusy(false)
  }
  const tile = { width: 160, height: 200, objectFit: 'cover', borderRadius: 12, display: 'block', background: 'var(--surface-2)' }
  return (
    <Card
      title="Verification request"
      subtitle={`Asked for a blue tick ${u.verification.at ? ago(u.verification.at) : ''}. Check the selfie matches the profile photos.`}
      style={{ marginBottom: 20 }}
      footer={
        <div className="a-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="soft-danger" icon={X} disabled={busy} onClick={() => decide(false)}>
            Reject
          </Button>
          <Button variant="primary" icon={Check} disabled={busy} onClick={() => decide(true)}>
            Approve blue tick
          </Button>
        </div>
      }
    >
      <div className="a-row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        <div>
          <div className="a-small a-muted" style={{ marginBottom: 6 }}>Selfie</div>
          {u.verification.selfie ? (
            <a href={u.verification.selfie} target="_blank" rel="noreferrer">
              <img src={u.verification.selfie} alt="Verification selfie" style={{ ...tile, outline: '2px solid var(--info)' }} />
            </a>
          ) : (
            <div style={tile} className="a-faint" />
          )}
        </div>
        <div>
          <div className="a-small a-muted" style={{ marginBottom: 6 }}>Profile photos</div>
          {u.photos?.length ? (
            <div className="a-row wrap" style={{ gap: 10 }}>
              {u.photos.map(p => (
                <a key={p} href={p} target="_blank" rel="noreferrer">
                  <img src={p} alt="" loading="lazy" style={tile} />
                </a>
              ))}
            </div>
          ) : (
            <span className="a-muted">No profile photos to compare with.</span>
          )}
        </div>
      </div>
    </Card>
  )
}

function UserDetail({ d, reload }) {
  const { db, me } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null) // coins | suspend | ban
  const u = d.user
  const id = u.id
  const canAudit = canAccess(me.role, 'audit')
  const historyRes = useApi(canAudit && tab === 'history' ? '/admin/audit' : null, { target: id, limit: 50 })
  const history = historyRes.data?.items || []

  const calls = d.calls.map(c => ({ ...c, status: callStatus(c.status), ts: c.connectedAt || c.createdAt, coins: c.chargedCoins || 0 }))
  const payments = d.payments.map(p => ({ ...p, ts: p.createdAt, status: p.status === 'created' ? 'pending' : p.status }))
  const reports = [
    ...d.reports.map(r => ({ ...r, against: true })),
    ...d.reportsFiled.map(r => ({ ...r, id: `${r.id}-f`, against: false })),
  ].map(r => ({ ...r, ts: r.createdAt }))
  const reportsAgainst = d.reports.length

  const run = async (fn, ok) => {
    try {
      await fn()
      toast(ok)
      reload()
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      return false
    }
  }

  const setStatus = (status, reason, days) =>
    run(() => api.post(`/admin/users/${id}/status`, { status, reason: reason || undefined, days: days || undefined }), `${u.name} is now ${status}`)

  const paidTotal = payments.filter(p => p.status === 'success').reduce((n, p) => n + p.amount, 0)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Users', to: '/admin/users' }, { label: u.name || u.phone }]}
        title={
          <span className="a-row" style={{ gap: 14 }}>
            <Avatar src={u.avatar} name={u.name} size={52} />
            <span>
              <span className="a-row" style={{ gap: 8 }}>
                {u.name || 'Unnamed'}
                {u.verified ? <BadgeCheck size={20} color="var(--info)" /> : null}
              </span>
              <span className="a-row" style={{ gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600 }}>
                <span className="a-mono a-muted">{u.id}</span>
                <Status value={u.status} />
                {u.vip ? <Badge tone="warning">{u.vip >= 4 ? 'VIP Elite' : `VIP ${u.vip}`}</Badge> : null}
                {u.isHost ? <Badge tone="brand">Host</Badge> : null}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            <Button icon={Coins} onClick={() => setModal('coins')}>
              Adjust coins
            </Button>
            <Button
              icon={BadgeCheck}
              onClick={() => run(() => api.patch(`/admin/users/${id}`, { verified: !u.verified }), u.verified ? 'Verification removed' : 'Profile verified')}
            >
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
        {u.coinsBought != null ? (
          <Stat
            label="Coins bought"
            value={num(u.coinsBought)}
            sub={
              <span className="a-row" style={{ gap: 6 }}>
                Sender frame <FrameChip tier={frameOf(db.config.senderTiers, u.coinsBought)} />
              </span>
            }
          />
        ) : null}
        <Stat label="Total spent" value={inr(u.spent)} sub={(n => `${n} successful payment${n === 1 ? '' : 's'}`)(payments.filter(p => p.status === 'success').length)} />
        <Stat label="Calls" value={num(calls.length)} sub={`${num(calls.reduce((n, c) => n + (c.minutes || 0), 0))} billed min`} />
        <Stat label="Reports" value={reportsAgainst} sub="against this user" />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'calls', label: 'Calls', count: calls.length },
          { value: 'payments', label: 'Payments', count: payments.length },
          { value: 'coins', label: 'Coin history', count: d.coinTxns.length },
          { value: 'reports', label: 'Reports', count: reports.length },
          ...(canAudit ? [{ value: 'history', label: 'Admin history' }] : []),
        ]}
      />

      {tab === 'overview' && u.verification?.status === 'pending' ? (
        <VerificationRequest
          user={u}
          onDecide={ok =>
            run(() => api.patch(`/admin/users/${id}`, { verified: ok }), ok ? 'Blue tick approved' : 'Verification request rejected')
          }
        />
      ) : null}

      {tab === 'overview' ? (
        <div className="a-grid c2">
          <Card title="Profile">
            <dl className="a-dl">
              <dt>Phone</dt>
              <dd>{u.phone || '—'}</dd>
              <dt>Email</dt>
              <dd>{u.email || '—'}</dd>
              <dt>Gender · age</dt>
              <dd>
                {u.gender || '—'} · {u.age ?? '—'}
              </dd>
              <dt>City</dt>
              <dd>{u.city || '—'}</dd>
              <dt>Device</dt>
              <dd>{deviceText(u.device)}</dd>
              <dt>Joined</dt>
              <dd>{dateTime(u.joined)}</dd>
              <dt>Last active</dt>
              <dd>{ago(u.lastActive)}</dd>
              <dt>Following</dt>
              <dd>{num(u.following)}</dd>
            </dl>
          </Card>
          <Notes key={u.notes || ''} user={u} onSaved={reload} />
        </div>
      ) : null}

      {tab === 'calls' ? (
        <Card padded={false}>
          <DataTable
            rows={calls}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'host', label: 'Host', render: c => <Who src={c.host?.avatar} name={c.host?.name || 'Host'} sub={c.id} to={`/admin/hosts/${c.host?.id}`} /> },
              { key: 'type', label: 'Type', render: c => label(c.type) },
              { key: 'ts', label: 'When', sort: c => c.ts, render: c => dateTime(c.ts) },
              { key: 'duration', label: 'Duration', align: 'right', sort: c => c.duration || 0, render: c => duration(c.duration) },
              { key: 'coins', label: 'Coins', align: 'right', sort: c => c.coins, render: c => num(c.coins) },
              { key: 'status', label: 'Status', render: c => <Status value={c.refunded ? 'refunded' : c.status} /> },
            ]}
            empty={<Empty title={d.callsAvailable ? 'No calls yet' : 'Calls aren’t available yet'} />}
          />
        </Card>
      ) : null}

      {tab === 'payments' ? (
        <Card padded={false} subtitle={`${inr(paidTotal)} paid in total`}>
          <DataTable
            rows={payments}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'id', label: 'Payment', render: t => <span className="a-mono">{t.gatewayPaymentId || t.gatewayOrderId || t.id}</span> },
              { key: 'ts', label: 'When', sort: t => t.ts, render: t => dateTime(t.ts) },
              { key: 'coins', label: 'Coins', align: 'right', render: t => `${num(t.coins)}${t.bonus ? ` + ${num(t.bonus)}` : ''}` },
              { key: 'amount', label: 'Amount', align: 'right', sort: t => t.amount, render: t => <b className="a-strong">{inr(t.amount)}</b> },
              { key: 'method', label: 'Method', render: t => (t.method ? label(t.method) : '—') },
              { key: 'status', label: 'Status', render: t => <Status value={t.status} /> },
            ]}
            empty={<Empty title="No payments yet" />}
          />
        </Card>
      ) : null}

      {tab === 'coins' ? (
        <Card padded={false} subtitle="Last 100 coin movements">
          <DataTable
            rows={d.coinTxns}
            columns={[
              { key: 'title', label: 'What', render: t => <b className="a-strong">{t.title || label(t.type)}</b> },
              { key: 'type', label: 'Type', render: t => <Badge>{label(t.type)}</Badge> },
              { key: 'ts', label: 'When', render: t => dateTime(t.createdAt) },
              { key: 'coins', label: 'Coins', align: 'right', render: t => <b className={t.coins < 0 ? 'a-danger' : 'a-success'}>{t.coins > 0 ? '+' : ''}{num(t.coins)}</b> },
              { key: 'balance', label: 'Balance', align: 'right', render: t => num(t.balance) },
            ]}
            empty={<Empty title="No coin movements yet" />}
          />
        </Card>
      ) : null}

      {tab === 'reports' ? (
        <Card padded={false}>
          <DataTable
            rows={reports}
            columns={[
              { key: 'dir', label: '', render: r => <Badge tone={r.against ? 'danger' : 'info'}>{r.against ? 'Against user' : 'Filed by user'}</Badge> },
              { key: 'reason', label: 'Reason', render: r => <b className="a-strong">{r.reason}</b> },
              { key: 'other', label: 'Other party', render: r => (r.against ? r.reporterName || String(r.reporter) : r.targetName || `${label(r.targetType)} ${r.targetId}`) },
              { key: 'ts', label: 'When', render: r => ago(r.ts) },
              { key: 'status', label: 'Status', render: r => <Status value={r.status} /> },
            ]}
            empty={<Empty title="No reports" />}
          />
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card padded={false}>
          {historyRes.error ? (
            <ErrorState error={historyRes.error} onRetry={historyRes.reload} />
          ) : historyRes.data === undefined ? (
            <Loading />
          ) : history.length === 0 ? (
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
        onSave={async (delta, reason) => {
          const ok = await run(() => api.post(`/admin/users/${id}/coins`, { delta, reason }), `${delta > 0 ? 'Added' : 'Deducted'} ${num(Math.abs(delta))} coins`)
          if (ok) setModal(null)
        }}
      />
      <Suspend
        key={modal === 'suspend' ? 's-open' : 's-closed'}
        open={modal === 'suspend'}
        onClose={() => setModal(null)}
        onSave={async (days, reason) => {
          if (await setStatus('suspended', reason, days)) setModal(null)
        }}
      />
      <Confirm
        open={modal === 'ban'}
        title={`Ban ${u.name || 'this user'}?`}
        message="They’ll be signed out and can’t create a new account with this phone number."
        confirmLabel="Ban user"
        danger
        reason
        onClose={() => setModal(null)}
        onConfirm={async reason => {
          if (await setStatus('banned', reason)) setModal(null)
        }}
      />
    </>
  )
}
