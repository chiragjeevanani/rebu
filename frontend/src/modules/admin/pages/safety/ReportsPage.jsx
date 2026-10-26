import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Ban, CheckCircle2, Flag, ShieldOff, Trash2, XCircle } from 'lucide-react'
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
  Status,
  Tabs,
  Who,
} from '../../components/ui'
import { ago, dateTime, label, num } from '../../utils/format'

const RANK = { high: 0, medium: 1, low: 2 }
const TYPE_TONE = { user: 'info', host: 'brand', moment: 'violet', live: 'warning', room: 'warning' }
const DAY = 86400000
// Read the clock in event handlers only (kept out of render for the purity lint).
const stamp = () => Date.now()

const targetLink = t => (t.type === 'user' ? `/admin/users/${t.id}` : t.type === 'host' ? `/admin/hosts/${t.id}` : null)
const isAccount = t => t.type === 'user' || t.type === 'host'
const isContent = t => t.type === 'moment' || t.type === 'live' || t.type === 'room'

// Every action resolves the report; `apply` handles the side effect on the target.
const ACTIONS = {
  dismiss: {
    label: 'Dismiss',
    icon: XCircle,
    status: 'dismissed',
    text: () => 'No violation',
    title: 'Dismiss this report?',
    message: () => 'The report is closed with no action against the target.',
  },
  warn: {
    label: 'Warn',
    icon: AlertTriangle,
    status: 'resolved',
    text: () => 'Warned',
    title: 'Send a warning?',
    message: r => `${r.target.type === 'user' ? 'The user' : 'The host'} gets an in-app warning about this report. Write the message they’ll see.`,
    reason: 'Warning message',
  },
  remove: {
    label: 'Remove content',
    icon: Trash2,
    status: 'resolved',
    text: () => 'Content removed',
    title: 'Remove this content?',
    message: r => (r.target.type === 'moment' ? 'The moment is hidden from every feed.' : 'The stream is ended now and marked as removed.'),
    reason: 'Reason',
    danger: true,
  },
  suspend: {
    label: 'Suspend 7 days',
    icon: ShieldOff,
    status: 'resolved',
    text: () => 'Suspended 7 days',
    title: 'Suspend for 7 days?',
    message: r => `${r.target.name} is signed out and can’t use REBU for 7 days.`,
    reason: 'Reason (sent to them)',
    danger: true,
  },
  ban: {
    label: 'Ban',
    icon: Ban,
    status: 'resolved',
    text: () => 'Banned',
    title: 'Ban permanently?',
    message: r => `${r.target.name} is signed out and can’t come back with this phone number.`,
    reason: 'Reason (sent to them)',
    danger: true,
  },
}

const available = r => ['dismiss', 'warn', ...(isContent(r.target) ? ['remove'] : []), ...(isAccount(r.target) ? ['suspend', 'ban'] : [])]

function Target({ t, size = 32 }) {
  return (
    <div className="a-row" style={{ gap: 8, minWidth: 0 }}>
      <Who src={t.avatar} name={t.name} sub={t.id} size={size} to={targetLink(t)} />
      <Badge tone={TYPE_TONE[t.type]}>{label(t.type)}</Badge>
    </div>
  )
}

export default function ReportsPage() {
  const { db, me, update } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [priority, setPriority] = useState('all')
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [pending, setPending] = useState(null) // action key

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.reports.filter(
      r =>
        (priority === 'all' || r.priority === priority) &&
        (type === 'all' || r.target.type === type) &&
        (!t || [r.id, r.reason, r.target.name, r.target.id, r.reporter.name, r.reporter.id].some(v => String(v).toLowerCase().includes(t))),
    )
  }, [db.reports, priority, type, q])

  const counts = useMemo(
    () => ({
      open: filtered.filter(r => r.status === 'open').length,
      resolved: filtered.filter(r => r.status === 'resolved').length,
      dismissed: filtered.filter(r => r.status === 'dismissed').length,
    }),
    [filtered],
  )

  // Open queue: high priority first, then oldest. Closed tabs: newest first.
  const rows = useMemo(
    () =>
      filtered
        .filter(r => r.status === tab)
        .sort((a, b) => (tab === 'open' ? RANK[a.priority] - RANK[b.priority] || a.ts - b.ts : (b.handledAt || b.ts) - (a.handledAt || a.ts))),
    [filtered, tab],
  )

  const report = openId ? db.reports.find(r => r.id === openId) : null
  const otherReports = report ? db.reports.filter(r => r.target.id === report.target.id && r.id !== report.id) : []
  const act = pending ? ACTIONS[pending] : null

  const run = (key, note) => {
    const r = report
    const a = ACTIONS[key]
    const t = r.target
    const by = me?.name || 'Admin'
    const reasonText = note ? ` — ${note}` : ''

    if (key === 'remove') {
      if (t.type === 'moment' && db.moments.some(m => m.id === t.id)) {
        update('moments', t.id, { status: 'removed', removedReason: note }, [`Removed moment (report ${r.id})${reasonText}`, t.id])
      } else if (db.lives.some(l => l.id === t.id)) {
        update('lives', t.id, l => ({ status: 'removed', endedAt: l.endedAt || stamp(), removedReason: note }), [`Removed ${t.type} (report ${r.id})${reasonText}`, t.id])
      }
    }
    if (key === 'suspend' || key === 'ban') {
      const col = t.type === 'host' ? 'hosts' : 'users'
      update(
        col,
        t.id,
        key === 'ban'
          ? { status: 'banned', statusReason: note }
          : { status: 'suspended', statusReason: note, suspendedUntil: stamp() + 7 * DAY },
        [`${key === 'ban' ? 'Banned' : 'Suspended 7 days'} ${t.type} (report ${r.id})${reasonText}`, t.id],
      )
    }

    update(
      'reports',
      r.id,
      { status: a.status, action: a.text(r), handledBy: by, handledAt: stamp(), note: note || '' },
      [`${a.status === 'dismissed' ? 'Dismissed' : 'Resolved'} report: ${a.text(r)}${key === 'warn' ? reasonText : ''}`, r.id],
    )
    toast(a.status === 'dismissed' ? 'Report dismissed' : `Report resolved · ${a.text(r)}`)
  }

  const columns = [
    { key: 'priority', label: 'Priority', sort: r => -RANK[r.priority], render: r => <Status value={r.priority} /> },
    {
      key: 'reason',
      label: 'Reason',
      sort: r => r.reason,
      render: r => (
        <div style={{ minWidth: 180 }}>
          <b className="a-strong">{r.reason}</b>
          <div className="a-small a-muted a-mono">{r.id}</div>
        </div>
      ),
    },
    { key: 'target', label: 'Target', sort: r => r.target.name, render: r => <Target t={r.target} /> },
    { key: 'reporter', label: 'Reporter', sort: r => r.reporter.name, render: r => <Who src={r.reporter.avatar} name={r.reporter.name} sub={r.reporter.id} size={32} to={`/admin/users/${r.reporter.id}`} /> },
    { key: 'ts', label: 'When', sort: r => r.ts, render: r => <span className="a-nowrap a-muted" title={dateTime(r.ts)}>{ago(r.ts)}</span> },
    {
      key: 'status',
      label: 'Status',
      sort: r => r.status,
      render: r => (
        <div>
          <Status value={r.status} />
          {r.action && r.status !== 'open' ? <div className="a-small a-muted" style={{ marginTop: 4 }}>{r.action}</div> : null}
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${num(db.reports.filter(r => r.status === 'open').length)} open · ${num(db.reports.filter(r => r.status === 'open' && r.priority === 'high').length)} high priority`}
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'open', label: 'Open', count: counts.open },
          { value: 'resolved', label: 'Resolved', count: counts.resolved },
          { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
        ]}
      />

      <Card padded={false}>
        <DataTable
          key={tab}
          rows={rows}
          columns={columns}
          onRowClick={r => setOpenId(r.id)}
          empty={
            <Empty
              icon={tab === 'open' ? CheckCircle2 : Flag}
              title={tab === 'open' ? 'Queue is clear' : 'No reports'}
              text={tab === 'open' ? 'No open reports match these filters.' : 'Nothing matches these filters.'}
            />
          }
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Reason, target, reporter, ID" />
              <Select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                options={[
                  { value: 'all', label: 'Any priority' },
                  { value: 'high', label: 'High' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'low', label: 'Low' },
                ]}
              />
              <Select
                value={type}
                onChange={e => setType(e.target.value)}
                options={[
                  { value: 'all', label: 'All targets' },
                  { value: 'user', label: 'Users' },
                  { value: 'host', label: 'Hosts' },
                  { value: 'moment', label: 'Moments' },
                  { value: 'live', label: 'Lives' },
                  { value: 'room', label: 'Rooms' },
                ]}
              />
            </>
          }
        />
      </Card>

      {report ? (
        <Drawer
          open
          title={
            <span className="a-row" style={{ gap: 8 }}>
              Report <span className="a-mono">{report.id}</span>
            </span>
          }
          onClose={() => setOpenId(null)}
          footer={
            report.status === 'open' ? (
              <div className="a-row wrap" style={{ gap: 8, justifyContent: 'flex-end' }}>
                {available(report).map(k => {
                  const a = ACTIONS[k]
                  return (
                    <Button key={k} size="sm" icon={a.icon} variant={k === 'ban' ? 'danger' : a.danger ? 'soft-danger' : 'secondary'} onClick={() => setPending(k)}>
                      {a.label}
                    </Button>
                  )
                })}
              </div>
            ) : null
          }
        >
          <div className="a-stack">
            <div className="a-row wrap" style={{ gap: 8 }}>
              <Status value={report.status} />
              <Status value={report.priority}>{label(report.priority)} priority</Status>
            </div>

            <Card title={report.reason} subtitle={`Reported ${ago(report.ts)} · ${dateTime(report.ts)}`}>
              {report.details ? <p style={{ margin: 0 }}>{report.details}</p> : <span className="a-muted">No extra details from the reporter.</span>}
            </Card>

            <Card title="Reported">
              <div className="a-stack" style={{ gap: 12 }}>
                <Target t={report.target} size={44} />
                <dl className="a-dl">
                  <dt>Type</dt>
                  <dd>{label(report.target.type)}</dd>
                  <dt>{isContent(report.target) ? 'Content ID' : 'Account ID'}</dt>
                  <dd className="a-mono">{report.target.id}</dd>
                  <dt>Other reports</dt>
                  <dd>
                    {otherReports.length ? (
                      <span className={otherReports.length >= 3 ? 'a-danger' : ''}>
                        {otherReports.length} ({otherReports.filter(r => r.status === 'open').length} open)
                      </span>
                    ) : (
                      'None'
                    )}
                  </dd>
                </dl>
                {targetLink(report.target) ? (
                  <Link to={targetLink(report.target)} className="a-small" style={{ color: 'var(--brand)', fontWeight: 700 }}>
                    Open {report.target.type} profile →
                  </Link>
                ) : null}
              </div>
            </Card>

            <Card title="Reporter">
              <Who src={report.reporter.avatar} name={report.reporter.name} sub={report.reporter.id} to={`/admin/users/${report.reporter.id}`} />
            </Card>

            {report.status !== 'open' ? (
              <Card title="Outcome">
                <dl className="a-dl">
                  <dt>Action</dt>
                  <dd>{report.action || '—'}</dd>
                  <dt>Handled by</dt>
                  <dd>{report.handledBy || '—'}</dd>
                  {report.handledAt ? (
                    <>
                      <dt>When</dt>
                      <dd>{dateTime(report.handledAt)}</dd>
                    </>
                  ) : null}
                  {report.note ? (
                    <>
                      <dt>Note</dt>
                      <dd>{report.note}</dd>
                    </>
                  ) : null}
                </dl>
              </Card>
            ) : null}
          </div>
        </Drawer>
      ) : null}

      <Confirm
        open={!!act && !!report}
        title={act?.title}
        message={act && report ? act.message(report) : ''}
        confirmLabel={act?.label}
        danger={act?.danger}
        reason={!!act?.reason}
        reasonLabel={act?.reason}
        onClose={() => setPending(null)}
        onConfirm={note => {
          run(pending, note)
          setPending(null)
        }}
      />
    </>
  )
}
