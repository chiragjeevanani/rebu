import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Coins, Download, Flag, PhoneCall, PhoneOff, Radio, RotateCcw, Star, Video } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
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
import { dateTime, duration, exportCsv, inr, label, ms, num } from '../../utils/format'

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'ongoing', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'missed', label: 'Missed & declined' },
  { value: 'failed', label: 'Failed' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'refunded', label: 'Refunded' },
]

/** Tab badge from the server's per-tab counts (same filters, minus the tab). */
function tabCount(counts, tab) {
  if (!counts) return undefined
  if (tab === 'all') return (counts.ongoing || 0) + (counts.completed || 0) + (counts.missed || 0) + (counts.failed || 0)
  return counts[tab]
}

/** Ticking clock so in-progress durations stay current. */
function useNow(step = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), step)
    return () => clearInterval(t)
  }, [step])
  return now
}

// Ringing calls haven't connected yet, so they have no running time.
const liveSecs = (c, now) =>
  c.status === 'ongoing' ? (c.rawStatus === 'connected' ? Math.max(0, Math.round((now - ms(c.ts)) / 1000)) : 0) : c.duration

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
  const ongoing = c.status === 'ongoing'
  const minutes = ongoing ? Math.ceil(secs / 60) : c.minutes ?? Math.ceil(secs / 60)
  const coins = ongoing ? minutes * c.rate : c.coins
  const gross = coins * economy.coinInr
  const commission = economy.commission[c.type] ?? 0
  const hostNet = ongoing ? Math.round(gross * (1 - commission / 100) * 100) / 100 : c.hostNet
  const connected = c.status === 'completed' || c.rawStatus === 'connected'
  const endedSub = {
    missed: 'Not answered before the ring timeout',
    declined: 'Declined by the host',
    cancelled: 'Cancelled before the call connected',
  }[c.status]
  const endedAt = c.endedAt || (c.connectedAt ? ms(c.connectedAt) + c.duration * 1000 : null)

  return (
    <Drawer
      open
      title={
        <span className="a-row" style={{ gap: 8 }}>
          Call <span className="a-mono">{c.id.slice(-8)}</span>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button icon={Flag} onClick={onFlag}>
            {c.flagged ? 'Unflag' : 'Flag'}
          </Button>
          {ongoing ? (
            <Button variant="soft-danger" icon={PhoneOff} onClick={onEnd}>
              End call
            </Button>
          ) : null}
          <Button variant="primary" icon={RotateCcw} disabled={c.refunded || !coins || ongoing} onClick={onRefund}>
            {c.refunded ? 'Refunded' : 'Refund coins'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <div className="a-row wrap" style={{ gap: 8 }}>
          <Status value={ongoing ? 'live' : c.status}>{ongoing ? (c.rawStatus === 'ringing' ? 'Ringing' : 'In progress') : null}</Status>
          <Badge tone="info">{label(c.type)} call</Badge>
          {c.random ? <Badge>Random match</Badge> : null}
          {c.flagged ? <Badge tone="warning">Flagged</Badge> : null}
          {c.refunded ? <Badge tone="violet">Refunded</Badge> : null}
        </div>

        <div className="a-grid c2">
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>User</div>
            <Who src={c.userAvatar} name={c.userName || 'User'} sub={c.userId} to={`/admin/users/${c.userId}`} />
          </div>
          <div>
            <div className="a-small a-muted" style={{ marginBottom: 6 }}>Host</div>
            <Who src={c.hostAvatar} name={c.hostName || 'Host'} sub={c.hostId} to={`/admin/hosts/${c.hostId}`} />
          </div>
        </div>

        <Card title="Timeline">
          <div className="a-timeline">
            <TlItem on title="Requested" sub={dateTime(c.createdAt || c.ts)} />
            <TlItem on={connected} title={connected ? 'Connected' : 'Not connected'} sub={connected ? dateTime(c.connectedAt || c.ts) : endedSub || (ongoing ? 'Ringing' : '')} />
            <TlItem
              on={!ongoing}
              title={ongoing ? 'In progress' : 'Ended'}
              sub={ongoing ? `${duration(secs)} so far` : `${endedAt ? dateTime(endedAt) : '—'} · ${duration(c.duration)}${c.endReason ? ` · ${label(c.endReason)}` : ''}`}
            />
          </div>
        </Card>

        <Card title="Billing" subtitle={ongoing ? 'Running total, billed per started minute' : 'Billed per started minute'}>
          <dl className="a-dl">
            <dt>Minutes billed</dt>
            <dd>{num(minutes)}</dd>
            <dt>Rate</dt>
            <dd>{num(c.rate)} coins / min</dd>
            <dt>Coins charged</dt>
            <dd>
              {num(minutes)} × {num(c.rate)} = <b className="a-strong">{num(coins)} coins</b>
            </dd>
            {c.giftCoins ? (
              <>
                <dt>In-call gifts</dt>
                <dd>{num(c.giftCoins)} coins</dd>
              </>
            ) : null}
            <dt>Gross value</dt>
            <dd>
              {inr(gross)} <span className="a-muted a-small">at {inr(economy.coinInr)} / coin</span>
            </dd>
            <dt>Commission</dt>
            <dd>
              {commission}% · {inr(Math.max(0, gross - hostNet))}
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
            {c.refundedBy ? ` · by ${c.refundedBy}` : ''}
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}

export default function CallsPage() {
  const { db } = useStore()
  const toast = useToast()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [tab, setTab] = useState('all')
  const [type, setType] = useState('all')
  const [open, setOpen] = useState(null)
  const [confirm, setConfirm] = useState(null) // refund | end

  // Keep the box in sync when the global search navigates here again.
  const urlQ = params.get('q') || ''
  const [lastUrlQ, setLastUrlQ] = useState(urlQ)
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ)
    setQ(urlQ)
  }

  const filters = { tab: tab === 'all' ? undefined : tab, type: type === 'all' ? undefined : type, q: q.trim() || undefined }
  const pg = usePaging(filters, 20)
  const res = useApi('/admin/calls', pg.query)
  const rows = res.data?.items || []
  const call = open ? rows.find(c => c.id === open) || null : null
  const economy = db.config.economy

  const connected = rows.filter(c => c.status === 'completed')
  const stats = {
    today: res.data?.stats?.today ?? 0,
    live: res.data?.stats?.live ?? 0,
    avg: connected.length ? connected.reduce((n, c) => n + c.duration, 0) / connected.length : 0,
    coins: rows.reduce((n, c) => n + c.coins, 0),
  }

  const columns = [
    {
      key: 'id',
      label: 'Call',
      render: c => (
        <span className="a-row" style={{ gap: 6 }}>
          <span className="a-mono" title={c.id}>{c.id.slice(-8)}</span>
          {c.flagged ? <Flag size={14} color="var(--warning)" aria-label="Flagged" /> : null}
        </span>
      ),
    },
    { key: 'user', label: 'User', render: c => <Who src={c.userAvatar} name={c.userName || 'User'} sub={c.userId.slice(-8)} size={32} to={`/admin/users/${c.userId}`} /> },
    { key: 'host', label: 'Host', render: c => <Who src={c.hostAvatar} name={c.hostName || 'Host'} sub={c.hostId.slice(-8)} size={32} to={`/admin/hosts/${c.hostId}`} /> },
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
    { key: 'ts', label: 'Started', serverSort: 'ts', render: c => <span className="a-nowrap">{dateTime(c.ts)}</span> },
    { key: 'duration', label: 'Duration', align: 'right', serverSort: 'minutes', render: c => (liveSecs(c, now) ? duration(liveSecs(c, now)) : <span className="a-faint">—</span>) },
    { key: 'rate', label: 'Rate', align: 'right', serverSort: 'rate', render: c => <span className="a-nowrap">{num(c.rate)}/min</span> },
    { key: 'coins', label: 'Coins', align: 'right', serverSort: 'coins', render: c => num(c.coins) },
    { key: 'hostNet', label: 'Host net', align: 'right', render: c => <b className="a-strong">{inr(c.hostNet)}</b> },
    {
      key: 'status',
      label: 'Status',
      serverSort: 'status',
      render: c => (
        <span className="a-row" style={{ gap: 6 }}>
          {c.status === 'ongoing' ? <Status value="live">{c.rawStatus === 'ringing' ? 'Ringing' : 'In progress'}</Status> : <Status value={c.status} />}
          {c.refunded ? <Badge tone="violet">Refunded</Badge> : null}
        </span>
      ),
    },
  ]

  const refund = async reason => {
    try {
      const r = await api.post(`/admin/calls/${call.id}/refund`, { reason })
      toast(`${num(r.coins)} coins returned to ${call.userName || 'the user'}`)
      res.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const end = async reason => {
    try {
      await api.post(`/admin/calls/${call.id}/end`, { reason })
      toast('Call ended')
    } catch (e) {
      toast(errorText(e), 'error')
    }
    // Reload either way: a 409 means it already ended on its own.
    res.reload()
  }

  const flag = async () => {
    try {
      await api.post(`/admin/calls/${call.id}/flag`, { flagged: !call.flagged })
      toast(call.flagged ? 'Flag removed' : 'Call flagged')
      res.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Every video and voice call between users and hosts, with billing."
        actions={
          <Button
            icon={Download}
            disabled={!rows.length}
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
        <Stat label="Average duration" value={duration(stats.avg)} sub="completed calls on this page" icon={Clock} />
        <Stat label="Coins billed" value={num(stats.coins)} sub={`${inr(stats.coins * economy.coinInr)} gross · this page`} icon={Coins} />
      </div>

      <Tabs tabs={TABS.map(t => ({ ...t, count: tabCount(res.data?.counts, t.value) }))} value={tab} onChange={setTab} />

      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
          onRowClick={c => setOpen(c.id)}
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
          onClose={() => setOpen(null)}
          onRefund={() => setConfirm('refund')}
          onFlag={flag}
          onEnd={() => setConfirm('end')}
        />
      ) : null}

      <Confirm
        open={confirm === 'end' && !!call}
        title="End this call now?"
        message={`Both sides are disconnected. ${call?.userName || 'The user'} is billed for the minutes so far.`}
        confirmLabel="End call"
        danger
        reason
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          setConfirm(null)
          end(reason)
        }}
      />
      <Confirm
        open={confirm === 'refund' && !!call}
        title={`Refund ${num(call?.coins)} coins?`}
        message={`The coins go back to ${call?.userName || 'the user'}’s balance and the host’s earnings for this call are reversed.`}
        confirmLabel="Refund coins"
        reason
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          setConfirm(null)
          refund(reason)
        }}
      />
    </>
  )
}
