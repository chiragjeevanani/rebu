import { useMemo, useState } from 'react'
import { BellRing, CalendarClock, Copy, Send, Users, XCircle } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, DataTable, Empty, Field, Input, PageHeader, SearchInput, Seg, Select, Status, Textarea } from '../../components/ui'
import { dateTime, num, pct } from '../../utils/format'

const DAY = 86400000
// Read the clock in handlers only; render uses the time captured on mount.
const clock = () => Date.now()
const TITLE_MAX = 60
const BODY_MAX = 160

const AUDIENCES = [
  { value: 'All users', hint: 'Every active user' },
  { value: 'Paying users', hint: 'Users who have bought coins at least once' },
  { value: 'VIP members', hint: 'Users with an active VIP tier' },
  { value: 'Inactive 14+ days', hint: 'Users who haven’t opened REBU in 14 days' },
  { value: 'New users (7 days)', hint: 'Joined in the last 7 days' },
  { value: 'All hosts', hint: 'Every active host' },
  { value: 'Hosts offline today', hint: 'Active hosts who are not online right now' },
  { value: 'Followers of live hosts', hint: 'Followers of hosts who are live right now' },
]

/** Estimated reach for an audience, from the demo data. */
function reachOf(audience, db, now) {
  const users = db.users.filter(u => u.status === 'active')
  const hosts = db.hosts.filter(h => h.status === 'active')
  switch (audience) {
    case 'All users':
      return users.length
    case 'Paying users':
      return users.filter(u => u.spent > 0).length
    case 'VIP members':
      return users.filter(u => u.vip > 0).length
    case 'Inactive 14+ days':
      return users.filter(u => now - u.lastActive > 14 * DAY).length
    case 'New users (7 days)':
      return users.filter(u => now - u.joined < 7 * DAY).length
    case 'All hosts':
      return hosts.length
    case 'Hosts offline today':
      return hosts.filter(h => !h.online).length
    case 'Followers of live hosts': {
      const live = new Set(db.lives.filter(l => l.status === 'live').map(l => l.hostId))
      return db.hosts.filter(h => live.has(h.id)).reduce((n, h) => n + h.followers, 0)
    }
    default:
      return 0
  }
}

const toLocalInput = ts => {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const blank = now => ({
  title: '',
  body: '',
  audience: 'All users',
  deeplink: 'rebu://home',
  mode: 'now',
  at: toLocalInput(now + DAY),
})

function Counter({ value, max }) {
  const left = max - value
  return <span className={left < 10 ? 'a-warning' : 'a-faint'}>{value}/{max}</span>
}

function PhonePreview({ title, body, when }) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth: 320,
        margin: '0 auto',
        aspectRatio: '9 / 15',
        borderRadius: 34,
        padding: 10,
        background: '#111',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <div
        style={{
          height: '100%',
          borderRadius: 26,
          padding: '18px 12px',
          background: '#2a2a31',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 22 }}>
          <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 600 }}>{when.day}</div>
          <div style={{ fontSize: 46, fontWeight: 300, lineHeight: 1.05 }}>{when.time}</div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: 11,
            borderRadius: 16,
            background: 'rgba(255,255,255,0.92)',
            color: '#111',
          }}
        >
          <img src="/rebu_logo.jpeg" alt="REBU" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 11, color: '#6e6e73', fontWeight: 600 }}>
              <span>REBU</span>
              <span style={{ marginLeft: 'auto' }}>now</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 13.5, overflowWrap: 'anywhere' }}>{title || 'Notification title'}</div>
            <div style={{ fontSize: 13, color: '#3a3a3c', overflowWrap: 'anywhere' }}>{body || 'Your message appears here.'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const { db, update, create, log } = useStore()
  const toast = useToast()
  const [now] = useState(clock)
  const [f, setF] = useState(() => blank(now))
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [cancelling, setCancelling] = useState(null)
  const set = patch => setF(x => ({ ...x, ...patch }))

  const reach = useMemo(() => reachOf(f.audience, db, now), [f.audience, db, now])
  const atTs = f.at ? new Date(f.at).getTime() : NaN

  const errors = {
    deeplink: f.deeplink && !/^rebu:\/\/\S+$/.test(f.deeplink.trim()) ? 'Deeplinks start with rebu://' : null,
    at: f.mode === 'schedule' && !(atTs > now) ? 'Pick a time in the future' : null,
  }
  const valid = f.title.trim() && f.body.trim() && !errors.deeplink && !errors.at

  const send = () => {
    const sendNow = f.mode === 'now'
    const when = sendNow ? clock() : atTs
    if (!sendNow && when <= clock()) {
      toast('The scheduled time has already passed', 'error')
      return
    }
    const n = create('notifications', {
      title: f.title.trim(),
      body: f.body.trim(),
      audience: f.audience,
      deeplink: f.deeplink.trim(),
      scheduledAt: sendNow ? null : when,
      sentAt: sendNow ? when : null,
      status: sendNow ? 'sent' : 'scheduled',
      delivered: sendNow ? Math.round(reach * 0.96) : 0,
      opened: 0,
    })
    log(`${sendNow ? 'Sent' : 'Scheduled'} push “${n.title}” to ${f.audience}`, n.id)
    toast(sendNow ? `Sent to ~${num(reach)} ${f.audience.toLowerCase()}` : `Scheduled for ${dateTime(when)}`)
    setF(blank(clock()))
  }

  const duplicate = n => {
    setF({
      title: n.title,
      body: n.body,
      audience: AUDIENCES.some(a => a.value === n.audience) ? n.audience : 'All users',
      deeplink: n.deeplink || 'rebu://home',
      mode: 'now',
      at: toLocalInput(clock() + DAY),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast('Copied into the composer')
  }

  const whenOf = n => n.sentAt || n.scheduledAt || 0
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.notifications
      .filter(n => (status === 'all' || n.status === status) && (!t || `${n.title} ${n.body} ${n.audience}`.toLowerCase().includes(t)))
      .sort((a, b) => whenOf(b) - whenOf(a))
  }, [db.notifications, q, status])

  const previewWhen = (() => {
    const d = new Date(f.mode === 'schedule' && atTs > 0 ? atTs : now)
    return {
      day: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
      time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: false }),
    }
  })()

  const audienceHint = AUDIENCES.find(a => a.value === f.audience)?.hint

  const columns = [
    {
      key: 'title',
      label: 'Notification',
      render: n => (
        <div style={{ maxWidth: 360 }}>
          <b className="a-strong">{n.title}</b>
          <div className="a-small a-muted" style={{ whiteSpace: 'normal' }}>{n.body}</div>
        </div>
      ),
    },
    { key: 'audience', label: 'Audience', sort: n => n.audience, render: n => <Badge>{n.audience}</Badge> },
    { key: 'status', label: 'Status', sort: n => n.status, render: n => <Status value={n.status} /> },
    {
      key: 'when',
      label: 'Sent / scheduled',
      sort: whenOf,
      render: n => (whenOf(n) ? <span className="a-nowrap">{dateTime(whenOf(n))}</span> : <span className="a-faint">—</span>),
    },
    { key: 'delivered', label: 'Delivered', align: 'right', sort: n => n.delivered, render: n => (n.delivered ? num(n.delivered) : '—') },
    { key: 'opened', label: 'Opened', align: 'right', sort: n => n.opened, render: n => (n.status === 'sent' ? num(n.opened) : '—') },
    {
      key: 'rate',
      label: 'Open rate',
      align: 'right',
      sort: n => (n.delivered ? n.opened / n.delivered : 0),
      render: n => (n.delivered ? <b className="a-strong">{pct((n.opened / n.delivered) * 100, 1)}</b> : '—'),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: n => (
        <span className="a-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
          {n.status === 'scheduled' ? (
            <Button size="sm" variant="ghost" icon={XCircle} onClick={() => setCancelling(n)}>
              Cancel
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" icon={Copy} onClick={() => duplicate(n)}>
            Duplicate
          </Button>
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Push notifications" subtitle="Send or schedule push notifications to users and hosts." />

      <div className="a-grid side" style={{ marginBottom: 20 }}>
        <Card title="Compose" subtitle="Keep it short. Most phones cut long titles.">
          <div className="a-stack">
            <Field label={<span className="a-row between">Title <Counter value={f.title.length} max={TITLE_MAX} /></span>}>
              <Input value={f.title} maxLength={TITLE_MAX} onChange={e => set({ title: e.target.value })} placeholder="Your favourite host is live 🔴" />
            </Field>
            <Field label={<span className="a-row between">Message <Counter value={f.body.length} max={BODY_MAX} /></span>}>
              <Textarea value={f.body} maxLength={BODY_MAX} rows={3} onChange={e => set({ body: e.target.value })} placeholder="Aanya just went live. Join now!" />
            </Field>
            <div className="a-grid c2">
              <Field label="Audience" hint={audienceHint}>
                <Select value={f.audience} onChange={e => set({ audience: e.target.value })} options={AUDIENCES.map(a => a.value)} />
              </Field>
              <Field label="Opens" hint="Screen the app opens on tap" error={errors.deeplink}>
                <Input className="a-mono" value={f.deeplink} onChange={e => set({ deeplink: e.target.value })} placeholder="rebu://home" />
              </Field>
            </div>
            <div
              className="a-row"
              style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}
            >
              <Users size={17} className="a-muted" />
              <span>
                Estimated reach <b className="a-strong">~{num(reach)}</b> {f.audience.includes('host') && f.audience !== 'Followers of live hosts' ? 'hosts' : 'people'}
              </span>
            </div>
            <div className="a-row wrap">
              <Seg
                options={[
                  { value: 'now', label: 'Send now' },
                  { value: 'schedule', label: 'Schedule' },
                ]}
                value={f.mode}
                onChange={mode => set({ mode })}
              />
              {f.mode === 'schedule' ? (
                <Field error={errors.at} style={{ flex: 1, minWidth: 200 }}>
                  <Input type="datetime-local" value={f.at} min={toLocalInput(now)} onChange={e => set({ at: e.target.value })} />
                </Field>
              ) : null}
            </div>
          </div>
          <div className="a-divider" />
          <div className="a-row">
            <Button variant="ghost" onClick={() => setF(blank(clock()))} disabled={!f.title && !f.body}>
              Clear
            </Button>
            <span className="a-spacer" />
            <Button variant="primary" icon={f.mode === 'now' ? Send : CalendarClock} disabled={!valid} onClick={send}>
              {f.mode === 'now' ? `Send to ~${num(reach)}` : 'Schedule'}
            </Button>
          </div>
        </Card>

        <Card title="Preview" subtitle="Lock screen on Android & iOS">
          <PhonePreview title={f.title.trim()} body={f.body.trim()} when={previewWhen} />
        </Card>
      </div>

      <Card title="History" padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Search title, message, audience" />
              <Seg
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'sent', label: 'Sent' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'draft', label: 'Draft' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
                value={status}
                onChange={setStatus}
              />
            </>
          }
          empty={<Empty icon={BellRing} title="No notifications" text="Notifications you send or schedule show up here." />}
        />
      </Card>

      <Confirm
        open={!!cancelling}
        title="Cancel scheduled notification?"
        message={cancelling ? `“${cancelling.title}” won’t be sent on ${dateTime(cancelling.scheduledAt)}. You can duplicate it later to send again.` : ''}
        confirmLabel="Cancel notification"
        danger
        onClose={() => setCancelling(null)}
        onConfirm={() => {
          update('notifications', cancelling.id, { status: 'cancelled' }, [`Cancelled scheduled push “${cancelling.title}”`, cancelling.id])
          toast('Scheduled notification cancelled')
          setCancelling(null)
        }}
      />
    </>
  )
}
