import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, Hourglass, Percent } from 'lucide-react'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { Badge, Card, DataTable, Empty, PageHeader, SearchInput, Stat, Status, Tabs, Who } from '../../components/ui'
import { ago, dateTime, ms } from '../../utils/format'

const DAY = 86400000

const matchTone = v => (v >= 80 ? 'success' : v >= 70 ? 'warning' : 'danger')

function waitLabel(t) {
  const h = t / 3600000
  if (h < 1) return `${Math.max(1, Math.round(t / 60000))}m`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export default function ApplicationsPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  // Captured once per visit so render stays pure.
  const [now] = useState(() => Date.now())

  const pg = usePaging({ status: tab, q: term || undefined }, 20)
  const res = useApi('/admin/applications', pg.query)
  const rows = res.data?.items
  const counts = res.data?.counts || {}

  // Queue stats: up to 100 oldest pending and 100 latest approvals.
  const pendingRes = useApi('/admin/applications', { status: 'pending', limit: 100 })
  const approvedRes = useApi('/admin/applications', { status: 'approved', limit: 100 })

  const stats = useMemo(() => {
    const waits = (pendingRes.data?.items || []).map(a => now - ms(a.submittedAt))
    const c = pendingRes.data?.counts || {}
    const approved = c.approved || 0
    const decided = approved + (c.rejected || 0)
    return {
      avgWait: waits.length ? waits.reduce((n, w) => n + w, 0) / waits.length : 0,
      oldest: waits.length ? Math.max(...waits) : 0,
      approved7d: (approvedRes.data?.items || []).filter(a => a.reviewedAt && ms(a.reviewedAt) >= now - 7 * DAY).length,
      rate: decided ? Math.round((approved / decided) * 100) : 0,
      decided,
      pending: c.pending || 0,
    }
  }, [pendingRes.data, approvedRes.data, now])

  const columns = [
    { key: 'name', label: 'Applicant', render: a => <Who src={a.avatar} name={a.name} sub={[a.id, a.phone].filter(Boolean).join(' · ')} /> },
    {
      key: 'submittedAt',
      label: 'Submitted',
      render: a => (
        <span className="a-nowrap" title={dateTime(a.submittedAt)}>
          {ago(a.submittedAt)}
        </span>
      ),
    },
    { key: 'age', label: 'Age', align: 'right', render: a => <span className={a.age != null && a.age < 19 ? 'a-warning a-strong' : ''}>{a.age ?? '—'}</span> },
    { key: 'gender', label: 'Gender' },
    {
      key: 'faceMatch',
      label: 'Face match',
      align: 'right',
      render: a => (typeof a.faceMatch === 'number' ? <Badge tone={matchTone(a.faceMatch)}>{a.faceMatch}%</Badge> : <span className="a-faint">—</span>),
    },
    {
      key: 'flags',
      label: 'Flags',
      render: a =>
        a.flags?.length ? (
          <span className="a-row wrap" style={{ gap: 4 }}>
            {a.flags.map(f => (
              <Badge key={f} tone="warning">
                {f}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="a-faint">—</span>
        ),
    },
    { key: 'agencyCode', label: 'Agency code', render: a => (a.agencyCode ? <span className="a-mono">{a.agencyCode}</span> : <span className="a-faint">—</span>) },
    tab === 'pending'
      ? { key: 'status', label: 'Status', render: a => <Status value={a.status} /> }
      : {
          key: 'reviewedAt',
          label: 'Decision',
          render: a => (
            <span>
              <Status value={a.status} />
              <span className="a-small a-muted a-nowrap" style={{ display: 'block' }}>
                {a.reviewedBy} · {a.reviewedAt ? ago(a.reviewedAt) : ''}
              </span>
            </span>
          ),
        },
  ]

  return (
    <>
      <PageHeader title="Host applications" subtitle="Review new host sign-ups. Oldest pending applications are shown first." />

      <div className="a-grid c4" style={{ marginBottom: 20 }}>
        <Stat label="Pending" value={stats.pending} icon={Hourglass} sub={stats.pending ? `oldest waiting ${waitLabel(stats.oldest)}` : 'Queue is clear'} />
        <Stat label="Average wait" value={stats.pending ? waitLabel(stats.avgWait) : '—'} icon={Clock} sub="for pending applications" />
        <Stat label="Approved (7 days)" value={stats.approved7d} icon={CheckCircle2} sub="new hosts this week" />
        <Stat label="Approval rate" value={stats.decided ? `${stats.rate}%` : '—'} icon={Percent} sub={`of ${stats.decided} decided`} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: 'Pending', count: counts.pending },
          { value: 'approved', label: 'Approved', count: counts.approved },
          { value: 'rejected', label: 'Rejected', count: counts.rejected },
        ]}
      />

      <Card padded={false}>
        <DataTable
          key={tab}
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
          onRowClick={a => navigate(`/admin/host-applications/${a.id}`)}
          toolbar={<SearchInput value={q} onChange={setQ} placeholder="Name, ID, agency code" />}
          empty={
            q ? (
              <Empty title="No results" text="Try a different search." />
            ) : tab === 'pending' ? (
              <Empty icon={CheckCircle2} title="All caught up" text="There are no applications waiting for review." />
            ) : (
              <Empty title={`No ${tab} applications`} />
            )
          }
        />
      </Card>
    </>
  )
}
