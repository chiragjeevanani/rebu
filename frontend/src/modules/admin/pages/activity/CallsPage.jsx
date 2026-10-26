import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Coins, Download, Flag, PhoneCall, PhoneOff, Radio, RotateCcw, Star, Video } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Drawer,
  Empty,
  PageHeader,
  SearchInput,
  Select,
  Stat,
  Status,
  Tabs,
  Who,
} from '../../components/ui'
import { dateTime, duration, exportCsv, inr, label, num } from '../../utils/format'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'ongoing', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed & declined' },
  { value: 'failed', label: 'Failed' },
  { value: 'flagged', label: 'Flagged' },
]

const inTab = (c, tab) =>
  tab === 'all' ||
  (tab === 'flagged' ? c.flagged : tab === 'missed' ? c.status === 'missed' || c.status === 'declined' : c.status === tab)

/** Ticking clock so in-progress durations stay current. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const liveSecs = (c, now) => (c.status === 'ongoing' ? Math.max(0, Math.round((now - c.ts) / 1000)) : c.duration)

function TlItem({ on, title, sub }) {
  return (
    <div className="a-tl-item">
      <span className={`a-tl-dot ${on ? 'on' : ''}`} />
      <div>
        <b className="a-strong">{title}</b>
        <div className="a-small a-muted">{sub}</div>
      </div>
    </div>
  )
}

function CallDrawer({ call: c, economy, now, onClose, onRefund, onFlag, onEnd }) {
  const secs = liveSecs(c, now)
  const minutes = Math.ceil(secs / 60)
  const coins = c.status === 'ongoing' ? minutes * c.rate : c.coins
  const gross = coins * economy.coinInr
  const commission = economy.commission[c.type] ?? 0
  const hostNet = c.status === 'ongoing' ? Math.round(gross * (1 - commission / 100) * 100) / 100 : c.hostNet
  const connected = c.status === 'completed' || c.status === 'ongoing'
  const endedSub = {
    missed: 'Not answered before the ring timeout',
    declined: 'Declined by the host',
    failed: 'Connection failed before the call started',
  }[c.status]

  return (
    <Drawer
      open
      title={
        <span className="a-row" style={{ gap: 8 }}>
          Call <span className="a-mono">{c.id}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button icon={Flag} onClick={onFlag}>
            {c.flagged ? 'Unflag' : 'Flag'}
          </Button>
          {c.status === 'ongoing' ? (
            <Button variant="soft-danger" icon={PhoneOff} onClick={onEnd}>
              End call
            </Button>
          ) : null}
          <Button variant="primary" icon={RotateCcw} disabled={c.refunded || !coins} onClick={onRefund}>
            {c.refunded ? 'Refunded' : 'Refund coins'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <div className="a-row wrap" style={{ gap: 8 }}>
          <Status value={c.status === 'ongoing' ? 'live' : c.status}>{c.status === 'ongoing' ? 'In progress' : null}</Status>
          <Badge tone="info">{label(c.type)} call</Badge>
          {c.flagged ? <Badge tone="warning">Flagged</Badge> : null}
          {c.refunded ? <Badge tone="violet">Refunded</Badge> : null}
        </div>

        <div className="a-grid c2">
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>User</div>
            <Who src={c.userAvatar} name={c.userName} sub={c.userId} to={`/admin/users/${c.userId}`} />
          </div>
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>Host</div>
            <Who src={c.hostAvatar} name={c.hostName} sub={c.hostId} to={`/admin/hosts/${c.hostId}`} />
          </div>
        </div>

        <Card title="Timeline">
          <div className="a-timeline">
            <TlItem on title="Requested" sub={dateTime(c.ts)} />
            <TlItem on={connected} title={connected ? 'Connected' : 'Not connected'} sub={connected ? dateTime(c.ts) : endedSub} />
            <TlItem
              on={c.status !== 'ongoing'}
              title={c.status === 'ongoing' ? 'In progress' : 'Ended'}
              sub={c.status === 'ongoing' ? `${duration(secs)} so far` : `${dateTime(c.ts + c.duration * 1000)} · ${duration(c.duration)}`}
            />
          </div>
        </Card>

        <Card title="Billing" subtitle={c.status === 'ongoing' ? 'Running total, billed per started minute' : 'Billed per started minute'}>
          <dl className="a-dl">
            <dt>Minutes billed</dt>
            <dd>{num(minutes)}</dd>
            <dt>Rate</dt>
            <dd>{num(c.rate)} coins / min</dd>
            <dt>Coins charged</dt>
            <dd>
              {num(minutes)} × {num(c.rate)} = <b className="a-strong">{num(coins)} coins</b>
            </dd>
            <dt>Gross value</dt>
            <dd>
              {inr(gross)} <span className="a-muted a-small">at {inr(economy.coinInr)} / coin</span>
            </dd>
            <dt>Commission</dt>
            <dd>
              {commission}% · {inr(gross - hostNet)}
            </dd>
            <dt>Host net</dt>
            <dd>
              <b className="a-success">{inr(hostNet)}</b>
            </dd>
          </dl>
        </Card>

        <Card title="Rating">
          {c.rating ? (
            <div className="a-row" style={{ gap: 4 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <Star key={i} size={18} color="var(--coin)" fill={i <= c.rating ? 'var(--coin)' : 'none'} />
              ))}
              <span className="a-muted" style={{ marginLeft: 6 }}>{c.rating} / 5 from the user</span>
            </div>
          ) : (
            <span className="a-muted">Not rated</span>
          )}
        </Card>

        {c.refunded ? (
          <div className="a-small a-muted">
            Refunded {num(c.refundCoins ?? c.coins)} coins{c.refundReason ? ` — ${c.refundReason}` : ''}
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}

export default function CallsPage() {
  const { db, update } = useStore()
  const toast = useToast()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [tab, setTab] = useState('all')
  const [type, setType] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [confirm, setConfirm] = useState(null) // refund | end

  // Keep the box in sync when the global search navigates here again.
  const urlQ = params.get('q') || ''
  const [lastUrlQ, setLastUrlQ] = useState(urlQ)
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ)
    setQ(urlQ)
  }

  const base = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.calls.filter(
      c =>
        (type === 'all' || c.type === type) &&
        (!t || [c.id, c.userName, c.hostName, c.userId, c.hostId].some(v => String(v).toLowerCase().includes(t))),
    )
  }, [db.calls, q, type])

  const rows = useMemo(() => base.filter(c => inTab(c, tab)), [base, tab])

  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t.value, base.filter(c => inTab(c, t.value)).length])), [base])

  const stats = useMemo(() => {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const connected = rows.filter(c => c.status === 'completed')
    return {
      today: db.calls.filter(c => c.ts >= start.getTime()).length,
      live: db.calls.filter(c => c.status === 'ongoing').length,
      avg: connected.length ? connected.reduce((n, c) => n + c.duration, 0) / connected.length : 0,
      coins: rows.reduce((n, c) => n + c.coins, 0),
    }
  }, [db.calls, rows, now])

  const call = openId ? db.calls.find(c => c.id === openId) : null
  const economy = db.config.economy

  const columns = [
    {
      key: 'id',
      label: 'Call',
      sort: c => c.id,
      render: c => (
        <span className="a-row" style={{ gap: 6 }}>
          <span className="a-mono">{c.id}</span>
          {c.flagged ? <Flag size={14} color="var(--warning)" aria-label="Flagged" /> : null}
        </span>
      ),
    },
    { key: 'user', label: 'User', sort: c => c.userName, render: c => <Who src={c.userAvatar} name={c.userName} sub={c.userId} size={32} to={`/admin/users/${c.userId}`} /> },
    { key: 'host', label: 'Host', sort: c => c.hostName, render: c => <Who src={c.hostAvatar} name={c.hostName} sub={c.hostId} size={32} to={`/admin/hosts/${c.hostId}`} /> },
    {
      key: 'type',
      label: 'Type',
      render: c => (
        <span className="a-row a-nowrap" style={{ gap: 6 }}>
          {c.type === 'video' ? <Video size={15} /> : <PhoneCall size={15} />}
          {label(c.type)}
        </span>
      ),
    },
    { key: 'ts', label: 'Started', sort: c => c.ts, render: c => <span className="a-nowrap">{dateTime(c.ts)}</span> },
    { key: 'duration', label: 'Duration', align: 'right', sort: c => liveSecs(c, now), render: c => (liveSecs(c, now) ? duration(liveSecs(c, now)) : <span className="a-faint">—</span>) },
    { key: 'rate', label: 'Rate', align: 'right', sort: c => c.rate, render: c => <span className="a-nowrap">{num(c.rate)}/min</span> },
    { key: 'coins', label: 'Coins', align: 'right', sort: c => c.coins, render: c => num(c.coins) },
    { key: 'hostNet', label: 'Host net', align: 'right', sort: c => c.hostNet, render: c => <b className="a-strong">{inr(c.hostNet)}</b> },
    {
      key: 'status',
      label: 'Status',
      sort: c => c.status,
      render: c => (
        <span className="a-row" style={{ gap: 6 }}>
          {c.status === 'ongoing' ? <Status value="live">In progress</Status> : <Status value={c.status} />}
          {c.refunded ? <Badge tone="violet">Refunded</Badge> : null}
        </span>
      ),
    },
  ]

  const refund = reason => {
    const coins = call.coins
    update('users', call.userId, u => ({ coins: (u.coins || 0) + coins }), [`Refunded ${num(coins)} coins for call ${call.id} — ${reason}`, call.userId])
    update('calls', call.id, { refunded: true, refundCoins: coins, refundReason: reason }, [`Refunded call — ${reason}`, call.id])
    toast(`${num(coins)} coins returned to ${call.userName}`)
  }

  const endCall = () => {
    const secs = liveSecs(call, Date.now())
    const coins = Math.ceil(secs / 60) * call.rate
    const commission = economy.commission[call.type] ?? 0
    update(
      'calls',
      call.id,
      {
        status: 'completed',
        duration: secs,
        coins,
        hostNet: Math.round(coins * economy.coinInr * (1 - commission / 100) * 100) / 100,
        endedByAdmin: true,
      },
      ['Ended in-progress call', call.id],
    )
    toast('Call ended')
  }

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Every video and voice call between users and hosts, with billing."
        actions={
          <Button
            icon={Download}
            onClick={() =>
              exportCsv('rebu-calls.csv', rows, [
                { label: 'Call ID', value: c => c.id },
                { label: 'User ID', value: c => c.userId },
                { label: 'User', value: c => c.userName },
                { label: 'Host ID', value: c => c.hostId },
                { label: 'Host', value: c => c.hostName },
                { label: 'Type', value: c => c.type },
                { label: 'Started', value: c => new Date(c.ts).toISOString() },
                { label: 'Duration (s)', value: c => c.duration },
                { label: 'Rate (coins/min)', value: c => c.rate },
                { label: 'Coins', value: c => c.coins },
                { label: 'Host net (INR)', value: c => c.hostNet },
                { label: 'Status', value: c => c.status },
                { label: 'Rating', value: c => c.rating || '' },
                { label: 'Flagged', value: c => (c.flagged ? 'yes' : '') },
                { label: 'Refunded', value: c => (c.refunded ? 'yes' : '') },
              ])
            }
          >
            Export CSV
          </Button>
        }
      />

      <div className="a-grid c4" style={{ marginBottom: 20 }}>
        <Stat label="Calls today" value={num(stats.today)} icon={PhoneCall} />
        <Stat label="In progress now" value={num(stats.live)} icon={Radio} />
        <Stat label="Average duration" value={duration(stats.avg)} sub="completed calls in view" icon={Clock} />
        <Stat label="Coins billed" value={num(stats.coins)} sub={`${inr(stats.coins * economy.coinInr)} gross · current filter`} icon={Coins} />
      </div>

      <Tabs tabs={TABS.map(t => ({ ...t, count: counts[t.value] }))} value={tab} onChange={setTab} />

      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          initialSort={{ key: 'ts', dir: 'desc' }}
          onRowClick={c => setOpenId(c.id)}
          empty={<Empty icon={PhoneCall} title="No calls" text="Nothing matches this tab and filter." />}
          toolbar={
            <>
              <SearchInput
                value={q}
                onChange={v => {
                  setQ(v)
                  setLastUrlQ(v)
                  setParams(v ? { q: v } : {}, { replace: true })
                }}
                placeholder="Call ID, user or host name"
              />
              <Select
                value={type}
                onChange={e => setType(e.target.value)}
                options={[
                  { value: 'all', label: 'All types' },
                  { value: 'video', label: 'Video' },
                  { value: 'voice', label: 'Voice' },
                ]}
              />
            </>
          }
        />
      </Card>

      {call ? (
        <CallDrawer
          call={call}
          economy={economy}
          now={now}
          onClose={() => setOpenId(null)}
          onRefund={() => setConfirm('refund')}
          onEnd={() => setConfirm('end')}
          onFlag={() => {
            update('calls', call.id, { flagged: !call.flagged }, [call.flagged ? 'Unflagged call' : 'Flagged call', call.id])
            toast(call.flagged ? 'Flag removed' : 'Call flagged')
          }}
        />
      ) : null}

      <Confirm
        open={confirm === 'refund' && !!call}
        title={`Refund ${num(call?.coins)} coins?`}
        message={`The coins go back to ${call?.userName}’s balance. The host’s earning for this call isn’t changed here.`}
        confirmLabel="Refund coins"
        reason
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          refund(reason)
          setConfirm(null)
        }}
      />
      <Confirm
        open={confirm === 'end' && !!call}
        title="End this call?"
        message="Both sides are disconnected now. The user is billed for the minutes so far."
        confirmLabel="End call"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          endCall()
          setConfirm(null)
        }}
      />
    </>
  )
}
