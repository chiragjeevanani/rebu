import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Download, RotateCcw, ShieldOff, Star } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, DataTable, PageHeader, SearchInput, Seg, Select, Status, Who } from '../../components/ui'
import { exportCsv, inr, num } from '../../utils/format'

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

const LEVEL_TONES = ['neutral', 'info', 'violet', 'warning']

export default function HostsPage() {
  const { db, update, log } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [status, setStatus] = useState('all')
  const [level, setLevel] = useState('any')
  const [online, setOnline] = useState('any')
  const [agency, setAgency] = useState('any')
  const [confirm, setConfirm] = useState(null) // { ids, clear }

  const agencyById = useMemo(() => Object.fromEntries(db.agencies.map(a => [a.id, a])), [db.agencies])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.hosts.filter(
      h =>
        (status === 'all' || h.status === status) &&
        (level === 'any' || h.level === Number(level)) &&
        (online === 'any' || (online === 'online' ? h.online : !h.online)) &&
        (agency === 'any' || (agency === 'independent' ? !h.agencyId : h.agencyId === agency)) &&
        (!t || [h.name, h.id, h.phone, h.city].some(v => String(v).toLowerCase().includes(t))),
    )
  }, [db.hosts, q, status, level, online, agency])

  const counts = useMemo(
    () => ({
      total: db.hosts.length,
      online: db.hosts.filter(h => h.online && h.status === 'active').length,
      suspended: db.hosts.filter(h => h.status === 'suspended').length,
      banned: db.hosts.filter(h => h.status === 'banned').length,
    }),
    [db.hosts],
  )

  const apply = (next, ids, reason) => {
    ids.forEach(id =>
      update('hosts', id, next === 'active' ? { status: 'active', statusReason: '' } : { status: next, statusReason: reason || '', online: false }),
    )
    log(`${next === 'active' ? 'Reactivated' : 'Suspended'} ${ids.length} host(s)${reason ? ` — ${reason}` : ''}`, ids.join(', '))
    toast(`${ids.length} host${ids.length > 1 ? 's' : ''} ${next === 'active' ? 'reactivated' : 'suspended'}`)
  }

  const agencyName = h => (h.agencyId ? agencyById[h.agencyId]?.name || 'Unknown agency' : 'Independent')

  const columns = [
    {
      key: 'name',
      label: 'Host',
      sort: h => h.name,
      render: h => <Who src={h.avatar} name={h.name} sub={`${h.id} · ${h.city}`} to={`/admin/hosts/${h.id}`} />,
    },
    { key: 'level', label: 'Level', sort: h => h.level, render: h => <Badge tone={LEVEL_TONES[h.level - 1]}>Lv {h.level}</Badge> },
    { key: 'video', label: 'Video', align: 'right', sort: h => h.rates.video, render: h => <span className="a-nowrap">{h.rates.video}/min</span> },
    { key: 'voice', label: 'Voice', align: 'right', sort: h => h.rates.voice, render: h => <span className="a-nowrap">{h.rates.voice}/min</span> },
    { key: 'callMinutes', label: 'Call min', align: 'right', sort: h => h.callMinutes, render: h => num(h.callMinutes) },
    { key: 'lifetime', label: 'Earned', align: 'right', sort: h => h.lifetime, render: h => <b className="a-strong">{inr(h.lifetime)}</b> },
    { key: 'available', label: 'Balance', align: 'right', sort: h => h.available, render: h => inr(h.available) },
    {
      key: 'rating',
      label: 'Rating',
      sort: h => h.rating,
      render: h => (
        <span className="a-row a-nowrap" style={{ gap: 4 }}>
          <Star size={14} color="var(--coin)" fill="var(--coin)" />
          {Number(h.rating).toFixed(1)}
        </span>
      ),
    },
    { key: 'agency', label: 'Agency', sort: agencyName, render: h => <span className={h.agencyId ? '' : 'a-muted'}>{agencyName(h)}</span> },
    {
      key: 'status',
      label: 'Status',
      sort: h => `${h.status}${h.online ? 0 : 1}`,
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
            onClick={() =>
              exportCsv('rebu-hosts.csv', rows, [
                { label: 'ID', value: h => h.id },
                { label: 'Name', value: h => h.name },
                { label: 'Phone', value: h => h.phone },
                { label: 'City', value: h => h.city },
                { label: 'Level', value: h => h.level },
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
          onRowClick={h => navigate(`/admin/hosts/${h.id}`)}
          initialSort={{ key: 'lifetime', dir: 'desc' }}
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
                placeholder="Name, ID, phone, city"
              />
              <Seg options={STATUS} value={status} onChange={setStatus} />
              <Select
                value={level}
                onChange={e => setLevel(e.target.value)}
                options={[{ value: 'any', label: 'All levels' }, ...db.config.hostLevels.map(l => ({ value: String(l.level), label: `Level ${l.level}` }))]}
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
                  ...db.agencies.map(a => ({ value: a.id, label: a.name })),
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
