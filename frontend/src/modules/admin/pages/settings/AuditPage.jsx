import { useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { Button, Card, DataTable, Empty, PageHeader, SearchInput, Seg, Select, Who } from '../../components/ui'
import { ago, dateTime, exportCsv } from '../../utils/format'
import { ROLES } from '../../routes/nav'

const HOUR = 3600000
const RANGES = [
  { value: '24h', label: '24h', ms: 24 * HOUR },
  { value: '7d', label: '7 days', ms: 7 * 24 * HOUR },
  { value: '30d', label: '30 days', ms: 30 * 24 * HOUR },
  { value: 'all', label: 'All', ms: Infinity },
]

export default function AuditPage() {
  const { db } = useStore()
  const [now] = useState(() => Date.now())
  const [q, setQ] = useState('')
  const [admin, setAdmin] = useState('all')
  const [range, setRange] = useState('all')

  const byName = useMemo(() => new Map(db.admins.map(a => [a.name, a])), [db.admins])
  const adminNames = useMemo(
    () => Array.from(new Set([...db.admins.map(a => a.name), ...db.audit.map(e => e.admin)])).sort(),
    [db.admins, db.audit],
  )

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const since = now - RANGES.find(r => r.value === range).ms
    return db.audit
      .filter(
        e =>
          (admin === 'all' || e.admin === admin) &&
          (range === 'all' || e.ts >= since) &&
          (!t || `${e.action} ${e.target}`.toLowerCase().includes(t)),
      )
      .sort((a, b) => b.ts - a.ts)
  }, [db.audit, q, admin, range, now])

  const columns = [
    {
      key: 'ts',
      label: 'When',
      sort: e => e.ts,
      width: 170,
      render: e => (
        <span className="a-nowrap" title={new Date(e.ts).toLocaleString()}>
          {dateTime(e.ts)}
          <span className="a-small a-faint" style={{ display: 'block' }}>{ago(e.ts)}</span>
        </span>
      ),
    },
    {
      key: 'admin',
      label: 'Admin',
      sort: e => e.admin,
      render: e => {
        const a = byName.get(e.admin)
        return <Who src={a?.avatar} name={e.admin} sub={a ? ROLES[a.role]?.label : e.admin === 'System' ? 'Automatic' : 'Former admin'} size={30} />
      },
    },
    { key: 'action', label: 'Action', render: e => <span className="a-strong" style={{ fontWeight: 600 }}>{e.action}</span> },
    { key: 'target', label: 'Target', render: e => (e.target ? <span className="a-mono">{e.target}</span> : <span className="a-faint">—</span>) },
  ]

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`Every admin action, newest first. ${db.audit.length} entries kept (latest 500).`}
        actions={
          <Button
            icon={Download}
            disabled={!rows.length}
            onClick={() =>
              exportCsv('rebu-audit-log.csv', rows, [
                { label: 'Time', value: e => new Date(e.ts).toISOString() },
                { label: 'Admin', value: e => e.admin },
                { label: 'Action', value: e => e.action },
                { label: 'Target', value: e => e.target },
                { label: 'Entry ID', value: e => e.id },
              ])
            }
          >
            Export CSV
          </Button>
        }
      />
      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          pageSize={20}
          initialSort={{ key: 'ts', dir: 'desc' }}
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Search action or target" />
              <Select
                value={admin}
                onChange={e => setAdmin(e.target.value)}
                options={[{ value: 'all', label: 'All admins' }, ...adminNames.map(n => ({ value: n, label: n }))]}
              />
              <Seg options={RANGES.map(({ value, label }) => ({ value, label }))} value={range} onChange={setRange} />
            </>
          }
          empty={<Empty icon={ScrollText} title="No matching entries" text="Try a wider date range or a different admin." />}
        />
      </Card>
    </>
  )
}
