import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, Clock, Hourglass, Percent } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { Badge, Card, DataTable, Empty, PageHeader, SearchInput, Stat, Status, Tabs, Who } from '../../components/ui'
import { ago, dateTime } from '../../utils/format'

const DAY = 86400000

const matchTone = v => (v >= 80 ? 'success' : v >= 70 ? 'warning' : 'danger')

function waitLabel(ms) {
  const h = ms / 3600000
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`
  if (h < 48) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

export default function ApplicationsPage() {
  const { db } = useStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('pending')
  const [q, setQ] = useState('')
  // Captured once per visit so render stays pure.
  const [now] = useState(() => Date.now())

  const apps = db.applications
  const by = useMemo(
    () => ({
      pending: apps.filter(a => a.status === 'pending'),
      approved: apps.filter(a => a.status === 'approved'),
      rejected: apps.filter(a => a.status === 'rejected'),
    }),
    [apps],
  )

  const stats = useMemo(() => {
    const waits = by.pending.map(a => now - a.submittedAt)
    const decided = by.approved.length + by.rejected.length
    return {
      avgWait: waits.length ? waits.reduce((n, w) => n + w, 0) / waits.length : 0,
      oldest: waits.length ? Math.max(...waits) : 0,
      approved7d: by.approved.filter(a => a.reviewedAt && a.reviewedAt >= now - 7 * DAY).length,
      rate: decided ? Math.round((by.approved.length / decided) * 100) : 0,
      decided,
    }
  }, [by, now])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return by[tab].filter(a => !t || [a.name, a.id, a.phone, a.agencyCode].some(v => String(v || '').toLowerCase().includes(t)))
  }, [by, tab, q])

  const columns = [
    { key: 'name', label: 'Applicant', sort: a => a.name, render: a => <Who src={a.avatar} name={a.name} sub={`${a.id} · ${a.phone}`} /> },
    {
      key: 'submittedAt',
      label: 'Submitted',
      sort: a => a.submittedAt,
      render: a => (
        <span className="a-nowrap" title={dateTime(a.submittedAt)}>
          {ago(a.submittedAt)}
        </span>
      ),
    },
    { key: 'age', label: 'Age', align: 'right', sort: a => a.age, render: a => <span className={a.age < 19 ? 'a-warning a-strong' : ''}>{a.age}</span> },
    { key: 'gender', label: 'Gender' },
    { key: 'faceMatch', label: 'Face match', align: 'right', sort: a => a.faceMatch, render: a => <Badge tone={matchTone(a.faceMatch)}>{a.faceMatch}%</Badge> },
    {
      key: 'flags',
      label: 'Flags',
      sort: a => a.flags.length,
      render: a =>
        a.flags.length ? (
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
          sort: a => a.reviewedAt || 0,
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
        <Stat label="Pending" value={by.pending.length} icon={Hourglass} sub={by.pending.length ? `oldest waiting ${waitLabel(stats.oldest)}` : 'Queue is clear'} />
        <Stat label="Average wait" value={by.pending.length ? waitLabel(stats.avgWait) : '—'} icon={Clock} sub="for pending applications" />
        <Stat label="Approved (7 days)" value={stats.approved7d} icon={CheckCircle2} sub="new hosts this week" />
        <Stat label="Approval rate" value={stats.decided ? `${stats.rate}%` : '—'} icon={Percent} sub={`of ${stats.decided} decided`} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pending', label: 'Pending', count: by.pending.length },
          { value: 'approved', label: 'Approved', count: by.approved.length },
          { value: 'rejected', label: 'Rejected', count: by.rejected.length },
        ]}
      />

      <Card padded={false}>
        <DataTable
          key={tab}
          rows={rows}
          columns={columns}
          onRowClick={a => navigate(`/admin/host-applications/${a.id}`)}
          initialSort={tab === 'pending' ? { key: 'submittedAt', dir: 'asc' } : { key: 'reviewedAt', dir: 'desc' }}
          toolbar={<SearchInput value={q} onChange={setQ} placeholder="Name, ID, phone, agency code" />}
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
