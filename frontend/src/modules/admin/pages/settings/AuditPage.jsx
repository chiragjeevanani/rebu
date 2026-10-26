import { useEffect, useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { Button, Card, DataTable, Empty, PageHeader, SearchInput, Seg, Select, Who } from '../../components/ui'
import { ago, dateTime, exportCsv } from '../../utils/format'
import { ROLES, canAccess } from '../../routes/nav'

const RANGES = [
  { value: '24h', label: '24h', days: 1 },
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: 'all', label: 'All', days: null },
]

/** Value that settles `delay` ms after the last change (search boxes). */
function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export default function AuditPage() {
  const { me } = useStore()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [admin, setAdmin] = useState('all')
  const [range, setRange] = useState('all')
  const [exporting, setExporting] = useState(false)

  const term = useDebounced(q.trim())
  const filters = { q: term, admin: admin === 'all' ? '' : admin, days: RANGES.find(r => r.value === range).days }
  const pg = usePaging(filters, 20)
  const res = useApi('/admin/audit', pg.query)
  const rows = res.data?.items || []
  // Avatars and roles for the admin column (the list needs the admins section).
  const team = useApi(canAccess(me.role, 'admins') ? '/admin/admins' : null)

  const byName = useMemo(() => new Map((team.data?.items || []).map(a => [a.name, a])), [team.data])
  const adminNames = useMemo(
    () => Array.from(new Set([...(team.data?.items || []).map(a => a.name), ...(res.data?.admins || [])])).sort(),
    [team.data, res.data],
  )

  // Export everything matching the filters, not just this page.
  const exportAll = async () => {
    setExporting(true)
    try {
      const all = []
      for (let page = 1; page <= 50; page += 1) {
        const r = await api.get('/admin/audit', { ...filters, page, limit: 100 })
        all.push(...r.items)
        if (page >= r.pages) break
      }
      exportCsv('rebu-audit-log.csv', all, [
        { label: 'Time', value: e => new Date(e.ts).toISOString() },
        { label: 'Admin', value: e => e.admin },
        { label: 'Action', value: e => e.action },
        { label: 'Target', value: e => e.target },
        { label: 'Entry ID', value: e => e.id },
      ])
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setExporting(false)
    }
  }

  const columns = [
    {
      key: 'ts',
      label: 'When',
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
        subtitle={`Every admin action, newest first.${res.data ? ` ${res.data.total} entries.` : ''}`}
        actions={
          <Button icon={Download} disabled={!rows.length || exporting} onClick={exportAll}>
            Export CSV
          </Button>
        }
      />
      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
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
