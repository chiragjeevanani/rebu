import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Ban, CheckCircle2, Flag, ShieldOff, Trash2, XCircle } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
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
  PageHeader,
  SearchInput,
  Select,
  Status,
  Tabs,
  Who,
} from '../../components/ui'
import { ago, dateTime, label, num } from '../../utils/format'

const TYPE_TONE = { user: 'info', host: 'brand', moment: 'violet', live: 'warning', room: 'warning', message: 'neutral' }
const REPORT_EVENTS = ['report:new']

const targetLink = t => (t.type === 'user' ? `/admin/users/${t.id}` : t.type === 'host' ? `/admin/hosts/${t.id}` : null)
const isAccount = t => t.type === 'user' || t.type === 'host'
const isContent = t => t.type === 'moment' || t.type === 'live' || t.type === 'room' || t.type === 'message'
// Warn / suspend / ban land on the account, or on the owner of reported content.
const hasAccount = t => isAccount(t) || !!t.owner

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
    message: r => `${r.target.type === 'user' ? 'The user' : r.target.type === 'host' ? 'The host' : 'The owner'} gets an in-app warning about this report. Write the message they’ll see.`,
    reason: 'Warning message',
  },
  remove: {
    label: 'Remove content',
    icon: Trash2,
    status: 'resolved',
    text: () => 'Content removed',
    title: 'Remove this content?',
    message: r =>
      r.target.type === 'moment'
        ? 'The moment is hidden from every feed.'
        : r.target.type === 'message'
          ? 'The message is removed from the chat.'
          : 'The stream is ended now and marked as removed.',
    reason: 'Reason',
    danger: true,
  },
  suspend: {
    label: 'Suspend 7 days',
    icon: ShieldOff,
    status: 'resolved',
    text: () => 'Suspended 7 days',
    title: 'Suspend for 7 days?',
    message: r => `${isAccount(r.target) ? r.target.name || 'This account' : 'The owner of this content'} is signed out and can’t use REBU for 7 days.`,
    reason: 'Reason (sent to them)',
    danger: true,
  },
  ban: {
    label: 'Ban',
    icon: Ban,
    status: 'resolved',
    text: () => 'Banned',
    title: 'Ban permanently?',
    message: r => `${isAccount(r.target) ? r.target.name || 'This account' : 'The owner of this content'} is signed out and can’t come back with this phone number.`,
    reason: 'Reason (sent to them)',
    danger: true,
  },
}

const available = r => ['dismiss', ...(hasAccount(r.target) ? ['warn'] : []), ...(isContent(r.target) ? ['remove'] : []), ...(hasAccount(r.target) ? ['suspend', 'ban'] : [])]

function Target({ t, size = 32 }) {
  return (
    <div className="a-row" style={{ gap: 8, minWidth: 0 }}>
      <Who src={t.avatar} name={t.name || label(t.type)} sub={t.id} size={size} to={targetLink(t)} />
      <Badge tone={TYPE_TONE[t.type]}>{label(t.type)}</Badge>
    </div>
  )
}

export default function ReportsPage() {
  const { refreshCounts } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('open')
  const [priority, setPriority] = useState('all')
  const [type, setType] = useState('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState(null)
  const [pending, setPending] = useState(null) // action key

  // The server orders the open queue high priority first, then oldest; closed tabs newest first.
  const pg = usePaging({ status: tab, priority: priority === 'all' ? undefined : priority, type: type === 'all' ? undefined : type, q: q.trim() || undefined }, 20)
  const res = useApi('/admin/reports', pg.query)
  const openRes = useApi('/admin/reports', { status: 'open', limit: 1 })
  const highRes = useApi('/admin/reports', { status: 'open', priority: 'high', limit: 1 })
  const detail = useApi(openId ? `/admin/reports/${openId}` : null)
  const reloadAll = () => {
    res.reload()
    openRes.reload()
    highRes.reload()
    if (openId) detail.reload()
  }
  useAdminEvent(REPORT_EVENTS, reloadAll)

  const rows = res.data?.items || []
  const counts = res.data?.counts || {}
  const report = openId ? (detail.data?.report?.id === openId ? detail.data.report : rows.find(r => r.id === openId)) || null : null
  const otherReports = detail.data?.report?.id === openId ? detail.data.otherReports : []
  const act = pending ? ACTIONS[pending] : null

  const run = async (key, note) => {
    try {
      const r = await api.post(`/admin/reports/${report.id}/resolve`, { action: key, note: note || '' })
      const done = r.report
      toast(done.status === 'dismissed' ? 'Report dismissed' : `Report resolved · ${done.action}`)
      refreshCounts()
    } catch (e) {
      toast(errorText(e), 'error')
    }
    reloadAll()
  }

  const columns = [
    { key: 'priority', label: 'Priority', serverSort: 'priority', render: r => <Status value={r.priority} /> },
    {
      key: 'reason',
      label: 'Reason',
      render: r => (
        <div style={{ minWidth: 180 }}>
          <b className="a-strong">{r.reason}</b>
          <div className="a-small a-muted a-mono">{r.id.slice(-8)}</div>
        </div>
      ),
    },
    { key: 'target', label: 'Target', render: r => <Target t={r.target} /> },
    { key: 'reporter', label: 'Reporter', render: r => <Who src={r.reporter.avatar} name={r.reporter.name || 'User'} sub={r.reporter.id.slice(-8)} size={32} to={`/admin/users/${r.reporter.id}`} /> },
    { key: 'ts', label: 'When', serverSort: 'ts', render: r => <span className="a-nowrap a-muted" title={dateTime(r.ts)}>{ago(r.ts)}</span> },
    {
      key: 'status',
      label: 'Status',
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
        subtitle={`${num(openRes.data?.total)} open · ${num(highRes.data?.total)} high priority`}
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
          {...serverTable(pg, res)}
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
                  { value: 'message', label: 'Messages' },
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
              Report <span className="a-mono">{report.id.slice(-8)}</span>
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
                  {report.target.owner ? (
                    <>
                      <dt>Owner</dt>
                      <dd>
                        <Link to={`/admin/users/${report.target.owner}`} className="a-mono" style={{ color: 'var(--brand)' }}>
                          {report.target.owner}
                        </Link>
                      </dd>
                    </>
                  ) : null}
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
              <Who src={report.reporter.avatar} name={report.reporter.name || 'User'} sub={report.reporter.id} to={`/admin/users/${report.reporter.id}`} />
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
          const key = pending
          setPending(null)
          run(key, note)
        }}
      />
    </>
  )
}
