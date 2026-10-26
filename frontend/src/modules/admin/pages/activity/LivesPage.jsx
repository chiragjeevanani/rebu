import { useEffect, useState } from 'react'
import { AlertTriangle, Eye, Gem, Info, Mic, Radio, Ticket, Users, Video, XCircle } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { serverTable, useAdminEvent, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  Seg,
  Stat,
  Status,
  Tabs,
  Textarea,
  Who,
} from '../../components/ui'
import { compact, dateTime, duration, label, ms, num } from '../../utils/format'

const LIVE_EVENTS = ['live:started', 'live:ended']

const MODES = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'premium', label: 'Premium' },
  { value: 'party', label: 'Party' },
  { value: 'audio', label: 'Audio' },
]
const MODE_META = {
  live: { label: 'Live', tone: 'brand', icon: Video },
  premium: { label: 'Premium', tone: 'warning', icon: Ticket },
  party: { label: 'Party room', tone: 'violet', icon: Users },
  audio: { label: 'Audio room', tone: 'info', icon: Mic },
}

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const elapsed = (l, now) => Math.max(0, Math.round(((l.endedAt ? ms(l.endedAt) : now) - ms(l.startedAt)) / 1000))
const guestCount = l => (Array.isArray(l.guests) ? l.guests.length : l.guests || 0)

function ModeBadge({ mode, ticket }) {
  const m = MODE_META[mode] || MODE_META.live
  return (
    <Badge tone={m.tone}>
      {m.label}
      {mode === 'premium' && ticket ? ` · ${ticket} coins` : ''}
    </Badge>
  )
}

function LiveCard({ l, now, onOpen, onWarn, onEnd }) {
  const Icon = (MODE_META[l.mode] || MODE_META.live).icon
  return (
    <div className="a-card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <button
        type="button"
        onClick={onOpen}
        style={{ position: 'relative', padding: 0, border: 0, background: 'var(--surface-2)', cursor: 'pointer', display: 'block' }}
        aria-label={`Open ${l.title}`}
      >
        {l.mode === 'audio' || !l.cover ? (
          <div style={{ aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
            <Mic size={40} />
          </div>
        ) : (
          <img src={l.cover} alt="" loading="lazy" className="a-thumb" style={{ width: '100%', aspectRatio: '4 / 3', borderRadius: 0, display: 'block' }} />
        )}
        <span style={{ position: 'absolute', top: 10, left: 10 }}>
          <ModeBadge mode={l.mode} ticket={l.ticket} />
        </span>
        <span
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            background: 'var(--brand)',
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: 999,
            letterSpacing: 0.3,
          }}
        >
          LIVE · {duration(elapsed(l, now))}
        </span>
        <span
          className="a-row"
          style={{
            position: 'absolute',
            left: 10,
            bottom: 10,
            gap: 10,
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            padding: '4px 9px',
            borderRadius: 999,
          }}
        >
          <span className="a-row" style={{ gap: 4 }}>
            <Eye size={13} /> {compact(l.viewers)}
          </span>
          <span className="a-row" style={{ gap: 4 }}>
            <Gem size={13} /> {compact(l.diamonds)}
          </span>
          {guestCount(l) ? (
            <span className="a-row" style={{ gap: 4 }}>
              <Users size={13} /> {guestCount(l)}
            </span>
          ) : null}
        </span>
      </button>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div className="a-row" style={{ gap: 6, minWidth: 0 }}>
          <Icon size={15} className="a-muted" style={{ flexShrink: 0 }} />
          <b className="a-strong" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.title}</b>
        </div>
        <Who src={l.hostAvatar} name={l.hostName || 'Host'} sub={`Live ${l.id.slice(-8)}`} size={32} to={`/admin/hosts/${l.hostId}`} />
        <div className="a-row" style={{ gap: 6, marginTop: 'auto' }}>
          <Button size="sm" icon={Info} onClick={onOpen}>
            Details
          </Button>
          <Button size="sm" icon={AlertTriangle} onClick={onWarn}>
            Warn
          </Button>
          <Button size="sm" variant="soft-danger" icon={XCircle} onClick={onEnd}>
            End
          </Button>
        </div>
      </div>
    </div>
  )
}

function WarnModal({ live, onClose, onSend }) {
  const [text, setText] = useState('Please follow the REBU host rules during your stream. Repeated violations will lead to suspension.')
  return (
    <Modal
      open
      title={`Warn ${live.hostName || 'host'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!text.trim()} onClick={() => onSend(text.trim())}>
            Send warning
          </Button>
        </>
      }
    >
      <p className="a-muted" style={{ marginBottom: 14 }}>
        The host sees this message on screen while they’re live. The stream keeps running.
      </p>
      <Field label="Message">
        <Textarea value={text} onChange={e => setText(e.target.value)} autoFocus />
      </Field>
    </Modal>
  )
}

export default function LivesPage() {
  const toast = useToast()
  const now = useNow()
  const [tab, setTab] = useState('now')
  const [mode, setMode] = useState('all')
  const [openId, setOpenId] = useState(null)
  const [warnId, setWarnId] = useState(null)
  const [endId, setEndId] = useState(null)

  const modeQ = mode === 'all' ? undefined : mode
  // Everything live now (one page is plenty) for the cards and stats, plus paged history.
  const allRes = useApi('/admin/lives', { tab: 'now', sort: 'viewers', dir: 'desc', limit: 100 })
  const pg = usePaging({ tab: 'history', mode: modeQ }, 20)
  const histRes = useApi(tab === 'history' ? '/admin/lives' : null, pg.query)
  const reloadAll = () => {
    allRes.reload()
    if (tab === 'history') histRes.reload()
  }
  useAdminEvent(LIVE_EVENTS, reloadAll)

  const allLive = allRes.data?.items || []
  const current = allLive.filter(l => mode === 'all' || l.mode === mode)
  const history = histRes.data?.items || []
  const stats = {
    live: allRes.data?.stats?.live ?? allLive.length,
    viewers: allLive.reduce((n, l) => n + (l.viewers || 0), 0),
    diamonds: allLive.reduce((n, l) => n + (l.diamonds || 0), 0),
    premium: allLive.filter(l => l.mode === 'premium').length,
  }

  const find = id => (id ? allLive.find(l => l.id === id) || history.find(l => l.id === id) || null : null)
  const open = find(openId)
  const warn = find(warnId)
  const ending = find(endId)

  const columns = [
    { key: 'host', label: 'Host', render: l => <Who src={l.hostAvatar} name={l.hostName || 'Host'} sub={l.id.slice(-8)} size={32} to={`/admin/hosts/${l.hostId}`} /> },
    { key: 'title', label: 'Title', render: l => <span className="a-strong">{l.title}</span> },
    { key: 'mode', label: 'Mode', render: l => <ModeBadge mode={l.mode} ticket={l.ticket} /> },
    { key: 'startedAt', label: 'Started', serverSort: 'started', render: l => <span className="a-nowrap">{dateTime(l.startedAt)}</span> },
    { key: 'duration', label: 'Duration', align: 'right', render: l => duration(elapsed(l, now)) },
    { key: 'peak', label: 'Peak viewers', align: 'right', serverSort: 'peak', render: l => num(l.peak) },
    { key: 'diamonds', label: 'Diamonds', align: 'right', render: l => <b className="a-strong">{num(l.diamonds)}</b> },
    { key: 'status', label: 'Status', render: l => <Status value={l.status} /> },
  ]

  return (
    <>
      <PageHeader title="Lives & rooms" subtitle="Monitor live streams, premium shows, party and audio rooms in real time." />

      <div className="a-grid c4" style={{ marginBottom: 20 }}>
        <Stat label="Live now" value={num(stats.live)} icon={Radio} />
        <Stat label="Viewers now" value={num(stats.viewers)} icon={Eye} />
        <Stat label="Diamonds in current lives" value={num(stats.diamonds)} icon={Gem} />
        <Stat label="Premium lives" value={num(stats.premium)} sub="ticketed shows running" icon={Ticket} />
      </div>

      <div className="a-row wrap between" style={{ alignItems: 'flex-end' }}>
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'now', label: 'Live now', count: current.length },
            { value: 'history', label: 'History', count: histRes.data?.total },
          ]}
        />
        <div style={{ marginBottom: 18 }}>
          <Seg options={MODES} value={mode} onChange={setMode} />
        </div>
      </div>

      {tab === 'now' ? (
        allRes.error && !allRes.data ? (
          <Card>
            <ErrorState error={allRes.error} onRetry={allRes.reload} />
          </Card>
        ) : !allRes.data ? (
          <Card>
            <Loading />
          </Card>
        ) : current.length ? (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
            {current.map(l => (
              <LiveCard key={l.id} l={l} now={now} onOpen={() => setOpenId(l.id)} onWarn={() => setWarnId(l.id)} onEnd={() => setEndId(l.id)} />
            ))}
          </div>
        ) : (
          <Card>
            <Empty icon={Radio} title="No one is live" text={mode === 'all' ? 'Live streams show up here as soon as a host goes live.' : 'No live streams in this mode right now.'} />
          </Card>
        )
      ) : (
        <Card padded={false}>
          <DataTable
            rows={history}
            columns={columns}
            {...serverTable(pg, histRes)}
            onRowClick={l => setOpenId(l.id)}
            empty={<Empty icon={Radio} title="No past streams" />}
          />
        </Card>
      )}

      {open ? (
        <Drawer
          open
          title={open.title}
          onClose={() => setOpenId(null)}
          footer={
            open.status === 'live' ? (
              <>
                <Button icon={AlertTriangle} onClick={() => setWarnId(open.id)}>
                  Warn host
                </Button>
                <Button variant="danger" icon={XCircle} onClick={() => setEndId(open.id)}>
                  End stream
                </Button>
              </>
            ) : null
          }
        >
          <div className="a-stack">
            {open.mode !== 'audio' && open.cover ? <img src={open.cover} alt="" className="a-thumb" style={{ width: '100%', aspectRatio: '16 / 10' }} /> : null}
            <div className="a-row wrap" style={{ gap: 8 }}>
              <Status value={open.status} />
              <ModeBadge mode={open.mode} ticket={open.ticket} />
            </div>
            <Who src={open.hostAvatar} name={open.hostName || 'Host'} sub={open.hostId} to={`/admin/hosts/${open.hostId}`} />
            <dl className="a-dl">
              <dt>Stream ID</dt>
              <dd className="a-mono">{open.id}</dd>
              <dt>Started</dt>
              <dd>{dateTime(open.startedAt)}</dd>
              <dt>{open.status === 'live' ? 'Live for' : 'Duration'}</dt>
              <dd>{duration(elapsed(open, now))}</dd>
              {open.endedAt ? (
                <>
                  <dt>Ended</dt>
                  <dd>{dateTime(open.endedAt)}</dd>
                </>
              ) : null}
              {open.status === 'live' ? (
                <>
                  <dt>Viewers now</dt>
                  <dd>{num(open.viewers)}</dd>
                </>
              ) : null}
              <dt>Peak viewers</dt>
              <dd>{num(open.peak)}</dd>
              <dt>Diamonds</dt>
              <dd>{num(open.diamonds)}</dd>
              <dt>Guests</dt>
              <dd>{guestCount(open) || '—'}</dd>
              {open.mode === 'premium' ? (
                <>
                  <dt>Ticket</dt>
                  <dd>{num(open.ticket)} coins</dd>
                </>
              ) : null}
              {open.endReason ? (
                <>
                  <dt>{open.status === 'removed' ? 'Removed because' : 'End reason'}</dt>
                  <dd className={open.status === 'removed' ? 'a-danger' : undefined}>
                    {label(open.endReason)}
                    {open.endedBy ? ` · by ${open.endedBy}` : ''}
                  </dd>
                </>
              ) : null}
              {open.warnings?.length ? (
                <>
                  <dt>Warnings</dt>
                  <dd>{open.warnings.map(w => w.message).join(' · ')}</dd>
                </>
              ) : null}
            </dl>
          </div>
        </Drawer>
      ) : null}

      {warn ? (
        <WarnModal
          live={warn}
          onClose={() => setWarnId(null)}
          onSend={async text => {
            try {
              await api.post(`/admin/lives/${warn.id}/warn`, { message: text })
              toast(`Warning sent to ${warn.hostName || 'the host'}`)
              setWarnId(null)
              reloadAll()
            } catch (e) {
              toast(errorText(e), 'error')
            }
          }}
        />
      ) : null}

      <Confirm
        open={!!ending}
        title="End this stream?"
        message={`${ending?.hostName || 'This host'}’s stream is stopped for all ${num(ending?.viewers)} viewers and marked as removed.`}
        confirmLabel="End stream"
        danger
        reason
        onClose={() => setEndId(null)}
        onConfirm={async reason => {
          const id = ending.id
          setEndId(null)
          try {
            await api.post(`/admin/lives/${id}/end`, { reason })
            toast('Stream ended')
          } catch (e) {
            toast(errorText(e), 'error')
          }
          reloadAll()
        }}
      />
    </>
  )
}
