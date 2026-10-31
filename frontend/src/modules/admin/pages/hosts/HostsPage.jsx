import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Download, RotateCcw, ShieldOff, Star } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { canAccess } from '../../routes/nav'
import { Button, Card, Confirm, DataTable, PageHeader, SearchInput, Seg, Select, Status, Who } from '../../components/ui'
import { CategoryChip } from '../../components/LevelChips'
import { categoryOf } from '../../utils/levels'
import { exportCsv, inr, num } from '../../utils/format'

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const total = res => res.data?.total ?? 0

export default function HostsPage() {
  const { db, me } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [status, setStatus] = useState('all')
  const [level, setLevel] = useState('any')
  const [online, setOnline] = useState('any')
  const [agency, setAgency] = useState('any')
  const [confirm, setConfirm] = useState(null) // { ids, clear }

  const term = useDebounced(q.trim())

  const agenciesRes = useApi(canAccess(me.role, 'agencies') ? '/admin/agencies' : null, { limit: 100 })
  const agencies = useMemo(() => agenciesRes.data?.items || [], [agenciesRes.data])
  const agencyById = useMemo(() => Object.fromEntries(agencies.map(a => [a.id, a])), [agencies])

  const filters = {
    q: term || undefined,
    status: status === 'all' ? undefined : status,
    level: level === 'any' ? undefined : level,
    online: online === 'any' ? undefined : online,
    agency: agency === 'any' ? undefined : agency === 'independent' ? 'none' : agency,
  }
  const pg = usePaging(filters, 20)
  const res = useApi('/admin/hosts', pg.query)
  const rows = res.data?.items

  const all = useApi('/admin/hosts', { limit: 1 })
  const onlineN = useApi('/admin/hosts', { limit: 1, online: 'true', status: 'active' })
  const suspN = useApi('/admin/hosts', { limit: 1, status: 'suspended' })
  const banN = useApi('/admin/hosts', { limit: 1, status: 'banned' })
  const counts = { total: total(all), online: total(onlineN), suspended: total(suspN), banned: total(banN) }

  const apply = async (next, ids, reason) => {
    try {
      const r = await api.post('/admin/hosts/bulk-status', { ids, status: next, reason: reason || undefined })
      toast(`${r.updated} host${r.updated === 1 ? '' : 's'} ${next === 'active' ? 'reactivated' : 'suspended'}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
    ;[res, onlineN, suspN, banN].forEach(r => r.reload())
  }

  const exportAll = async () => {
    try {
      const out = []
      for (let page = 1; page <= 50; page += 1) {
        const r = await api.get('/admin/hosts', { ...filters, page, limit: 100 })
        out.push(...r.items)
        if (page >= r.pages) break
      }
      return out
    } catch (e) {
      toast(errorText(e), 'error')
      return null
    }
  }

  const agencyName = h => (h.agencyId ? agencyById[h.agencyId]?.name || 'Agency' : 'Independent')

  const columns = [
    {
      key: 'name',
      label: 'Host',
      serverSort: 'name',
      render: h => <Who src={h.avatar} name={h.name} sub={[h.id, h.city].filter(Boolean).join(' · ')} to={`/admin/hosts/${h.id}`} />,
    },
    {
      key: 'level',
      label: 'Level',
      serverSort: 'level',
      render: h => <CategoryChip category={categoryOf(db.config.hostCategories, h.level)} suffix={`· Lv ${h.level}`} />,
    },
    { key: 'video', label: 'Video', align: 'right', render: h => <span className="a-nowrap">{h.rates.video}/min</span> },
    { key: 'voice', label: 'Voice', align: 'right', render: h => <span className="a-nowrap">{h.rates.voice}/min</span> },
    { key: 'callMinutes', label: 'Call min', align: 'right', serverSort: 'minutes', render: h => num(h.callMinutes) },
    { key: 'lifetime', label: 'Earned', align: 'right', serverSort: 'lifetime', render: h => <b className="a-strong">{inr(h.lifetime)}</b> },
    { key: 'available', label: 'Balance', align: 'right', serverSort: 'available', render: h => inr(h.available) },
    {
      key: 'rating',
      label: 'Rating',
      serverSort: 'rating',
      render: h => (
        <span className="a-row a-nowrap" style={{ gap: 4 }}>
          <Star size={14} color="var(--coin)" fill="var(--coin)" />
          {Number(h.rating).toFixed(1)}
        </span>
      ),
    },
    { key: 'agency', label: 'Agency', render: h => <span className={h.agencyId ? '' : 'a-muted'}>{agencyName(h)}</span> },
    {
      key: 'status',
      label: 'Status',
      render: h => (
        <span className="a-row a-nowrap" style={{ gap: 6 }}>
          {h.status === 'active' ? <Status value={h.online ? 'online' : 'offline'} /> : <Status value={h.status} />}
          {h.verified ? <BadgeCheck size={16} color="var(--info)" aria-label="Verified" /> : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Hosts"
        subtitle={`${num(counts.total)} hosts · ${num(counts.online)} online now · ${num(counts.suspended)} suspended${counts.banned ? ` · ${num(counts.banned)} banned` : ''}`}
        actions={
          <Button
            icon={Download}
            onClick={async () => {
              const list = await exportAll()
              if (list) exportCsv('rebu-hosts.csv', list, [
                { label: 'ID', value: h => h.id },
                { label: 'Name', value: h => h.name },
                { label: 'Phone', value: h => h.phone },
                { label: 'City', value: h => h.city },
                { label: 'Level', value: h => h.level },
                { label: 'Category', value: h => categoryOf(db.config.hostCategories, h.level)?.name || '' },
                { label: 'Video rate (coins/min)', value: h => h.rates.video },
                { label: 'Voice rate (coins/min)', value: h => h.rates.voice },
                { label: 'Call minutes', value: h => h.callMinutes },
                { label: 'Lifetime earned (INR)', value: h => h.lifetime },
                { label: 'Available (INR)', value: h => h.available },
                { label: 'Rating', value: h => h.rating },
                { label: 'Agency', value: agencyName },
                { label: 'Online', value: h => (h.online ? 'yes' : 'no') },
                { label: 'Status', value: h => h.status },
              ])
            }}
          >
            Export CSV
          </Button>
        }
      />
      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
          onRowClick={h => navigate(`/admin/hosts/${h.id}`)}
          selectable
          bulk={(ids, clear) => (
            <>
              <Button size="sm" icon={RotateCcw} onClick={() => { apply('active', ids); clear() }}>
                Reactivate
              </Button>
              <Button size="sm" variant="soft-danger" icon={ShieldOff} onClick={() => setConfirm({ ids, clear })}>
                Suspend
              </Button>
            </>
          )}
          toolbar={
            <>
              <SearchInput
                value={q}
                onChange={v => {
                  setQ(v)
                  setParams(v ? { q: v } : {}, { replace: true })
                }}
                placeholder="Name, ID, phone"
              />
              <Seg options={STATUS} value={status} onChange={setStatus} />
              <Select
                value={level}
                onChange={e => setLevel(e.target.value)}
                options={[{ value: 'any', label: 'All levels' }, ...db.config.hostLevels.map(l => ({ value: String(l.level), label: `Level ${l.level} · ${categoryOf(db.config.hostCategories, l.level)?.name || ''}` }))]}
              />
              <Select
                value={online}
                onChange={e => setOnline(e.target.value)}
                options={[
                  { value: 'any', label: 'Online & offline' },
                  { value: 'online', label: 'Online now' },
                  { value: 'offline', label: 'Offline' },
                ]}
              />
              <Select
                value={agency}
                onChange={e => setAgency(e.target.value)}
                options={[
                  { value: 'any', label: 'All agencies' },
                  { value: 'independent', label: 'Independent' },
                  ...agencies.map(a => ({ value: a.id, label: a.name })),
                ]}
              />
            </>
          }
        />
      </Card>

      <Confirm
        open={!!confirm}
        title={`Suspend ${confirm?.ids.length} host(s)?`}
        message="Suspended hosts go offline immediately, can’t receive calls or go live, and can’t withdraw until reactivated."
        confirmLabel="Suspend"
        danger
        reason
        reasonLabel="Reason (shown to the host)"
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          apply('suspended', confirm.ids, reason)
          confirm.clear()
          setConfirm(null)
        }}
      />
    </>
  )
}
