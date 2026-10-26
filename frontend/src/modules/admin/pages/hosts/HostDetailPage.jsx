import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ban, BadgeCheck, Building2, IndianRupee, Layers, Pencil, PowerOff, RotateCcw, ShieldOff, Star, UserX } from 'lucide-react'
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
  Who,
} from '../../components/ui'
import { ago, date, dateTime, duration, inr, label, num } from '../../utils/format'

const LEVEL_TONES = ['neutral', 'info', 'violet', 'warning']

/** Level a host would have from call minutes alone. */
const autoLevel = (levels, minutes) =>
  levels.reduce((lv, l) => (minutes >= l.minutes ? l.level : lv), levels[0]?.level || 1)

const capOf = (levels, level) => levels.find(l => l.level === level)?.maxRate ?? Infinity

/** Highest tier ≤ cap (falls back to the lowest tier). */
const clampRate = (tiers, value, cap) => {
  if (value <= cap) return value
  const ok = tiers.filter(t => t <= cap)
  return ok.length ? ok[ok.length - 1] : tiers[0]
}

function RateChips({ tiers, value, cap, onChange }) {
  return (
    <div className="a-row wrap" style={{ gap: 8 }}>
      {tiers.map(t => (
        <Button
          key={t}
          size="sm"
          variant={t === value ? 'primary' : 'secondary'}
          disabled={t > cap}
          title={t > cap ? 'Above this level’s max rate' : undefined}
          onClick={() => onChange(t)}
        >
          {t}
        </Button>
      ))}
    </div>
  )
}

function RatesModal({ open, host, tiers, cap, onClose, onSave }) {
  const [video, setVideo] = useState(host.rates.video)
  const [voice, setVoice] = useState(host.rates.voice)
  const changed = video !== host.rates.video || voice !== host.rates.voice
  return (
    <Modal
      open={open}
      title="Edit call prices"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!changed} onClick={() => onSave({ video, voice })}>
            Save prices
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <p className="a-muted">
          Level {host.level} hosts can charge up to <b className="a-strong">{cap} coins/min</b>. Higher tiers unlock as the host levels up.
        </p>
        <Field label={`Video call · ${video} coins/min`}>
          <RateChips tiers={tiers.video} value={video} cap={cap} onChange={setVideo} />
        </Field>
        <Field label={`Voice call · ${voice} coins/min`}>
          <RateChips tiers={tiers.voice} value={voice} cap={cap} onChange={setVoice} />
        </Field>
      </div>
    </Modal>
  )
}

function LevelModal({ open, host, levels, onClose, onSave }) {
  const auto = autoLevel(levels, host.callMinutes)
  const [value, setValue] = useState(host.levelOverride ? String(host.level) : 'auto')
  const next = value === 'auto' ? auto : Number(value)
  const cap = capOf(levels, next)
  const clamps = host.rates.video > cap || host.rates.voice > cap
  return (
    <Modal
      open={open}
      title="Change level"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(next, value !== 'auto')}>
            Save level
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Level" hint={`By call minutes (${num(host.callMinutes)} min) this host would be level ${auto}.`}>
          <Select
            value={value}
            onChange={e => setValue(e.target.value)}
            options={[
              { value: 'auto', label: `Automatic (level ${auto})` },
              ...levels.map(l => ({ value: String(l.level), label: `Level ${l.level} override · max ${l.maxRate} coins/min` })),
            ]}
          />
        </Field>
        {clamps ? (
          <p className="a-warning a-small">
            Current prices are above level {next}’s cap of {cap} coins/min and will be lowered to fit.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function AgencyModal({ open, host, agencies, onClose, onSave }) {
  const [value, setValue] = useState(host.agencyId || '')
  const options = agencies.filter(a => a.status === 'active' || a.id === host.agencyId)
  return (
    <Modal
      open={open}
      title="Agency"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={value === (host.agencyId || '')} onClick={() => onSave(value || null)}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Move host to" hint="Agencies take their cut from this host’s earnings from the next call onward.">
        <Select
          value={value}
          onChange={e => setValue(e.target.value)}
          options={[
            { value: '', label: 'Independent (no agency)' },
            ...options.map(a => ({ value: a.id, label: `${a.name} · ${a.code} · ${a.cut}% cut${a.status !== 'active' ? ' (suspended)' : ''}` })),
          ]}
        />
      </Field>
    </Modal>
  )
}

function EarningsModal({ open, host, onClose, onSave }) {
  const [mode, setMode] = useState('credit')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('Call billing correction')
  const n = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  const over = mode === 'debit' && n > host.available
  return (
    <Modal
      open={open}
      title="Adjust earnings"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!n || over} onClick={() => onSave(mode === 'credit' ? n : -n, reason)}>
            {mode === 'credit' ? `Credit ${inr(n)}` : `Debit ${inr(n)}`}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Seg
          options={[
            { value: 'credit', label: 'Credit' },
            { value: 'debit', label: 'Debit' },
          ]}
          value={mode}
          onChange={setMode}
        />
        <Field label="Amount (₹)" hint={`Available balance: ${inr(host.available)}`} error={over ? 'More than the host’s available balance' : null}>
          <Input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Reason (shown in the audit log)">
          <Select
            value={reason}
            onChange={e => setReason(e.target.value)}
            options={[
              'Call billing correction',
              'Earning dispute resolved',
              'Missing gift credit',
              'Contest / event reward',
              'Fraudulent calls reversed',
              'Policy violation penalty',
              'Other',
            ]}
          />
        </Field>
      </div>
    </Modal>
  )
}

export default function HostDetailPage() {
  const { id } = useParams()
  const { db, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null) // rates | level | agency | earnings | suspend | ban | offline
  const h = db.hosts.find(x => x.id === id)

  const calls = useMemo(() => db.calls.filter(c => c.hostId === id), [db.calls, id])
  const lives = useMemo(() => db.lives.filter(l => l.hostId === id), [db.lives, id])
  const payouts = useMemo(() => db.withdrawals.filter(w => w.hostId === id), [db.withdrawals, id])
  const reports = useMemo(() => db.reports.filter(r => r.target.id === id), [db.reports, id])
  const history = useMemo(() => db.audit.filter(a => String(a.target).includes(id)), [db.audit, id])

  if (!h) {
    return (
      <>
        <PageHeader crumbs={[{ label: 'Hosts', to: '/admin/hosts' }, { label: 'Not found' }]} title="Host not found" />
        <Card>
          <Empty icon={UserX} title="Host not found" text={`No host with ID ${id}. It may have been removed.`} />
          <div className="a-row" style={{ justifyContent: 'center' }}>
            <Link to="/admin/hosts" className="a-btn secondary">
              Back to hosts
            </Link>
          </div>
        </Card>
      </>
    )
  }

  const levels = db.config.hostLevels
  const cap = capOf(levels, h.level)
  const agency = h.agencyId ? db.agencies.find(a => a.id === h.agencyId) : null
  const close = () => setModal(null)

  const setStatus = (status, reason) => {
    update(
      'hosts',
      h.id,
      status === 'active' ? { status, statusReason: '' } : { status, statusReason: reason || '', online: false },
      [`${status === 'active' ? 'Reactivated' : status === 'banned' ? 'Banned' : 'Suspended'} host${reason ? ` — ${reason}` : ''}`, h.id],
    )
    toast(`${h.name} is now ${status}`)
  }

  const paidOut = payouts.filter(w => w.status === 'paid').reduce((n, w) => n + w.net, 0)
  const callNet = calls.reduce((n, c) => n + (c.hostNet || 0), 0)

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Hosts', to: '/admin/hosts' }, { label: h.name }]}
        title={
          <span className="a-row" style={{ gap: 14 }}>
            <Avatar src={h.avatar} name={h.name} size={52} />
            <span>
              <span className="a-row" style={{ gap: 8 }}>
                {h.name}
                {h.verified ? <BadgeCheck size={20} color="var(--info)" /> : null}
              </span>
              <span className="a-row wrap" style={{ gap: 8, marginTop: 4, fontSize: 13, fontWeight: 600 }}>
                <span className="a-mono a-muted">{h.id}</span>
                <Status value={h.status} />
                <Badge tone={LEVEL_TONES[h.level - 1]}>
                  Level {h.level}
                  {h.levelOverride ? ' · override' : ''}
                </Badge>
                {h.status === 'active' ? <Status value={h.online ? 'online' : 'offline'} /> : null}
              </span>
            </span>
          </span>
        }
        actions={
          <>
            {h.online ? (
              <Button icon={PowerOff} onClick={() => setModal('offline')}>
                Force offline
              </Button>
            ) : null}
            <Button icon={IndianRupee} onClick={() => setModal('earnings')}>
              Adjust earnings
            </Button>
            {h.status === 'active' ? (
              <>
                <Button icon={ShieldOff} onClick={() => setModal('suspend')}>
                  Suspend
                </Button>
                <Button variant="soft-danger" icon={Ban} onClick={() => setModal('ban')}>
                  Ban
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={RotateCcw} onClick={() => setModal('reactivate')}>
                Reactivate
              </Button>
            )}
          </>
        }
      />

      {h.status !== 'active' && h.statusReason ? (
        <div className="a-card" style={{ padding: 14, marginBottom: 16, background: 'var(--danger-soft)', borderColor: 'transparent', boxShadow: 'none' }}>
          <b className="a-danger">{label(h.status)}</b>
          <span className="a-muted"> — {h.statusReason}</span>
        </div>
      ) : null}

      <div className="a-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <Stat label="Lifetime earned" value={inr(h.lifetime)} sub="net of commission" />
        <Stat label="Available" value={inr(h.available)} icon={IndianRupee} sub={`${inr(paidOut)} paid out`} />
        <Stat label="Call minutes" value={num(h.callMinutes)} sub={`${num(calls.length)} calls in sample`} />
        <Stat label="Rating" value={Number(h.rating).toFixed(1)} icon={Star} sub={`${num(h.followers)} followers`} />
        <Stat label="Answer rate" value={`${h.answerRate}%`} sub={h.answerRate < 70 ? 'Below 70% — check' : 'of incoming calls'} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'calls', label: 'Calls', count: calls.length },
          { value: 'lives', label: 'Lives', count: lives.length },
          { value: 'payouts', label: 'Payouts', count: payouts.length },
          { value: 'reports', label: 'Reports', count: reports.length },
          { value: 'history', label: 'Admin history' },
        ]}
      />

      {tab === 'overview' ? (
        <div className="a-grid side">
          <div className="a-stack">
            <Card title="Profile">
              <dl className="a-dl">
                <dt>Phone</dt>
                <dd>{h.phone}</dd>
                <dt>Gender · age</dt>
                <dd>
                  {h.gender} · {h.age}
                </dd>
                <dt>City</dt>
                <dd>{h.city}</dd>
                <dt>Languages</dt>
                <dd>{(h.languages || []).join(', ') || '—'}</dd>
                <dt>Bio</dt>
                <dd>{h.bio || <span className="a-faint">No bio</span>}</dd>
                <dt>Joined</dt>
                <dd>
                  {date(h.joined)} <span className="a-muted">· {ago(h.joined)}</span>
                </dd>
                <dt>ID</dt>
                <dd>
                  {h.idType} <span className="a-mono">••{h.idLast4}</span>
                </dd>
                <dt>Verified</dt>
                <dd>{h.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</dd>
              </dl>
            </Card>
            <Card title="Photos" subtitle={`${(h.photos || []).length} profile photos`}>
              {(h.photos || []).length ? (
                <div className="a-grid c3">
                  {h.photos.map(p => (
                    <a key={p} href={p} target="_blank" rel="noreferrer">
                      <img src={p} alt="" className="a-thumb" loading="lazy" style={{ width: '100%', aspectRatio: '3 / 4', display: 'block' }} />
                    </a>
                  ))}
                </div>
              ) : (
                <Empty title="No photos" />
              )}
            </Card>
          </div>
          <div className="a-stack">
            <Card
              title="Call prices"
              subtitle={`Level ${h.level} cap: ${cap} coins/min`}
              actions={
                <Button size="sm" icon={Pencil} onClick={() => setModal('rates')}>
                  Edit
                </Button>
              }
            >
              <dl className="a-dl">
                <dt>Video</dt>
                <dd>{h.rates.video} coins/min</dd>
                <dt>Voice</dt>
                <dd>{h.rates.voice} coins/min</dd>
                <dt>Level</dt>
                <dd className="a-row" style={{ gap: 8 }}>
                  Level {h.level}
                  <Button size="sm" variant="ghost" icon={Layers} onClick={() => setModal('level')}>
                    Change
                  </Button>
                </dd>
              </dl>
            </Card>
            <Card
              title="Agency"
              actions={
                <Button size="sm" icon={Building2} onClick={() => setModal('agency')}>
                  {agency ? 'Change' : 'Assign'}
                </Button>
              }
            >
              {agency ? (
                <dl className="a-dl">
                  <dt>Name</dt>
                  <dd>
                    {agency.name} <Status value={agency.status} />
                  </dd>
                  <dt>Code</dt>
                  <dd className="a-mono">{agency.code}</dd>
                  <dt>Owner</dt>
                  <dd>{agency.owner}</dd>
                  <dt>Contact</dt>
                  <dd>{agency.phone}</dd>
                  <dt>Agency cut</dt>
                  <dd>{agency.cut}%</dd>
                </dl>
              ) : (
                <p className="a-muted">Independent host — keeps the full host share with no agency cut.</p>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'calls' ? (
        <Card padded={false} subtitle={`${inr(callNet)} host net across ${num(calls.length)} calls`}>
          <DataTable
            rows={calls}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'user', label: 'User', render: c => <Who src={c.userAvatar} name={c.userName} sub={c.id} to={`/admin/users/${c.userId}`} /> },
              { key: 'type', label: 'Type', render: c => label(c.type) },
              { key: 'ts', label: 'When', sort: c => c.ts, render: c => <span className="a-nowrap">{dateTime(c.ts)}</span> },
              { key: 'duration', label: 'Duration', align: 'right', sort: c => c.duration, render: c => duration(c.duration) },
              { key: 'rate', label: 'Rate', align: 'right', render: c => `${c.rate}/min` },
              { key: 'coins', label: 'Coins', align: 'right', sort: c => c.coins, render: c => num(c.coins) },
              { key: 'hostNet', label: 'Host net', align: 'right', sort: c => c.hostNet, render: c => <b className="a-strong">{inr(c.hostNet)}</b> },
              {
                key: 'status',
                label: 'Status',
                render: c => (
                  <span className="a-row" style={{ gap: 6 }}>
                    <Status value={c.status} />
                    {c.flagged ? <Badge tone="warning">Flagged</Badge> : null}
                  </span>
                ),
              },
            ]}
            empty={<Empty title="No calls yet" />}
          />
        </Card>
      ) : null}

      {tab === 'lives' ? (
        <Card padded={false}>
          <DataTable
            rows={lives}
            initialSort={{ key: 'startedAt', dir: 'desc' }}
            columns={[
              {
                key: 'title',
                label: 'Stream',
                render: l => (
                  <span className="a-row">
                    <img src={l.cover} alt="" className="a-thumb" style={{ width: 44, height: 44 }} loading="lazy" />
                    <span>
                      <b className="a-strong">{l.title}</b>
                      <span className="a-small a-muted" style={{ display: 'block' }}>
                        {l.id}
                      </span>
                    </span>
                  </span>
                ),
              },
              { key: 'mode', label: 'Mode', render: l => <Badge tone={l.mode === 'premium' ? 'violet' : 'neutral'}>{label(l.mode)}{l.ticket ? ` · ${l.ticket} coins` : ''}</Badge> },
              { key: 'startedAt', label: 'Started', sort: l => l.startedAt, render: l => <span className="a-nowrap">{dateTime(l.startedAt)}</span> },
              { key: 'length', label: 'Length', align: 'right', render: l => (l.endedAt ? duration((l.endedAt - l.startedAt) / 1000) : <span className="a-muted">ongoing</span>) },
              { key: 'peak', label: 'Peak viewers', align: 'right', sort: l => l.peak, render: l => num(l.peak) },
              { key: 'diamonds', label: 'Diamonds', align: 'right', sort: l => l.diamonds, render: l => num(l.diamonds) },
              { key: 'status', label: 'Status', render: l => <Status value={l.status} /> },
            ]}
            empty={<Empty title="No live streams yet" />}
          />
        </Card>
      ) : null}

      {tab === 'payouts' ? (
        <Card padded={false}>
          <DataTable
            rows={payouts}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              { key: 'id', label: 'Request', render: w => <span className="a-mono">{w.id}</span> },
              { key: 'ts', label: 'Requested', sort: w => w.ts, render: w => <span className="a-nowrap">{dateTime(w.ts)}</span> },
              { key: 'amount', label: 'Amount', align: 'right', sort: w => w.amount, render: w => inr(w.amount) },
              { key: 'fee', label: 'Fee', align: 'right', render: w => <span className="a-muted">{inr(w.fee)}</span> },
              { key: 'net', label: 'Net', align: 'right', sort: w => w.net, render: w => <b className="a-strong">{inr(w.net)}</b> },
              { key: 'method', label: 'Method', render: w => w.method?.label },
              {
                key: 'status',
                label: 'Status',
                render: w => (
                  <span>
                    <Status value={w.status} />
                    {w.utr ? <span className="a-small a-muted a-mono" style={{ display: 'block' }}>{w.utr}</span> : null}
                    {w.note ? <span className="a-small a-muted" style={{ display: 'block' }}>{w.note}</span> : null}
                  </span>
                ),
              },
            ]}
            empty={<Empty title="No withdrawals yet" />}
          />
        </Card>
      ) : null}

      {tab === 'reports' ? (
        <Card padded={false}>
          <DataTable
            rows={reports}
            initialSort={{ key: 'ts', dir: 'desc' }}
            columns={[
              {
                key: 'reason',
                label: 'Reason',
                render: r => (
                  <span>
                    <b className="a-strong">{r.reason}</b>
                    {r.details ? <span className="a-small a-muted" style={{ display: 'block' }}>{r.details}</span> : null}
                  </span>
                ),
              },
              { key: 'reporter', label: 'Reported by', render: r => <Who src={r.reporter.avatar} name={r.reporter.name} sub={r.reporter.id} size={30} to={`/admin/users/${r.reporter.id}`} /> },
              { key: 'ts', label: 'When', sort: r => r.ts, render: r => <span className="a-nowrap">{ago(r.ts)}</span> },
              { key: 'priority', label: 'Priority', render: r => <Status value={r.priority} /> },
              {
                key: 'status',
                label: 'Status',
                render: r => (
                  <span>
                    <Status value={r.status} />
                    {r.action ? <span className="a-small a-muted" style={{ display: 'block' }}>{r.action}</span> : null}
                  </span>
                ),
              },
            ]}
            empty={<Empty title="No reports against this host" />}
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
                <span className="a-small a-muted a-nowrap">{dateTime(a.ts)}</span>
              </div>
            ))
          )}
        </Card>
      ) : null}

      <RatesModal
        key={modal === 'rates' ? 'r-open' : 'r-closed'}
        open={modal === 'rates'}
        host={h}
        tiers={db.config.rateTiers}
        cap={cap}
        onClose={close}
        onSave={rates => {
          update('hosts', h.id, { rates }, [`Changed call prices to video ${rates.video} / voice ${rates.voice} coins/min (was ${h.rates.video} / ${h.rates.voice})`, h.id])
          toast('Call prices updated')
          close()
        }}
      />
      <LevelModal
        key={modal === 'level' ? 'l-open' : 'l-closed'}
        open={modal === 'level'}
        host={h}
        levels={levels}
        onClose={close}
        onSave={(level, override) => {
          const c = capOf(levels, level)
          const rates = {
            video: clampRate(db.config.rateTiers.video, h.rates.video, c),
            voice: clampRate(db.config.rateTiers.voice, h.rates.voice, c),
          }
          update('hosts', h.id, { level, levelOverride: override, rates }, [
            `${override ? 'Set level override' : 'Reset level to automatic'}: level ${h.level} → ${level}`,
            h.id,
          ])
          toast(`Level set to ${level}`)
          close()
        }}
      />
      <AgencyModal
        key={modal === 'agency' ? 'a-open' : 'a-closed'}
        open={modal === 'agency'}
        host={h}
        agencies={db.agencies}
        onClose={close}
        onSave={agencyId => {
          const to = db.agencies.find(a => a.id === agencyId)
          update('hosts', h.id, { agencyId }, [to ? `Moved host to agency ${to.name} (${to.code})` : 'Made host independent', h.id])
          toast(to ? `Moved to ${to.name}` : 'Host is now independent')
          close()
        }}
      />
      <EarningsModal
        key={modal === 'earnings' ? 'e-open' : 'e-closed'}
        open={modal === 'earnings'}
        host={h}
        onClose={close}
        onSave={(delta, reason) => {
          update('hosts', h.id, x => ({ available: Math.round((x.available + delta) * 100) / 100 }), [
            `${delta > 0 ? 'Credited' : 'Debited'} ${inr(Math.abs(delta))} ${delta > 0 ? 'to' : 'from'} available earnings — ${reason}`,
            h.id,
          ])
          toast(`${delta > 0 ? 'Credited' : 'Debited'} ${inr(Math.abs(delta))}`)
          close()
        }}
      />
      <Confirm
        open={modal === 'offline'}
        title={`Force ${h.name} offline?`}
        message="Any ringing calls are cancelled and the host disappears from For You until they go online again."
        confirmLabel="Force offline"
        onClose={close}
        onConfirm={() => {
          update('hosts', h.id, { online: false }, ['Forced host offline', h.id])
          toast(`${h.name} is now offline`)
          close()
        }}
      />
      <Confirm
        open={modal === 'suspend'}
        title={`Suspend ${h.name}?`}
        message="The host goes offline, can’t take calls or go live, and can’t withdraw until reactivated."
        confirmLabel="Suspend host"
        danger
        reason
        reasonLabel="Reason (shown to the host)"
        onClose={close}
        onConfirm={reason => {
          setStatus('suspended', reason)
          close()
        }}
      />
      <Confirm
        open={modal === 'ban'}
        title={`Ban ${h.name}?`}
        message="Banned hosts are removed from REBU permanently. Pending earnings are held for review."
        confirmLabel="Ban host"
        danger
        reason
        reasonLabel="Reason (shown to the host)"
        onClose={close}
        onConfirm={reason => {
          setStatus('banned', reason)
          close()
        }}
      />
      <Confirm
        open={modal === 'reactivate'}
        title={`Reactivate ${h.name}?`}
        message="The host can go online, take calls and withdraw again."
        confirmLabel="Reactivate"
        reason
        reasonLabel="Reason (for the audit log)"
        onClose={close}
        onConfirm={reason => {
          setStatus('active', reason)
          close()
        }}
      />
    </>
  )
}
