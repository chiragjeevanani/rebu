import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Ban, Download, RotateCcw, ShieldOff } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, DataTable, PageHeader, SearchInput, Seg, Select, Status, Who } from '../../components/ui'
import { ago, date, exportCsv, inr, num } from '../../utils/format'

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

export default function UsersPage() {
  const { db, update, log } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [status, setStatus] = useState('all')
  const [vip, setVip] = useState('any')
  const [device, setDevice] = useState('any')
  const [paying, setPaying] = useState('any')
  const [confirm, setConfirm] = useState(null) // { action, ids, clear }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return db.users.filter(
      u =>
        (status === 'all' || u.status === status) &&
        (vip === 'any' || (vip === 'vip' ? u.vip > 0 : u.vip === 0)) &&
        (device === 'any' || u.device === device) &&
        (paying === 'any' || (paying === 'paying' ? u.spent > 0 : u.spent === 0)) &&
        (!t || [u.name, u.id, u.phone, u.email, u.city].some(v => String(v).toLowerCase().includes(t))),
    )
  }, [db.users, q, status, vip, device, paying])

  const counts = useMemo(
    () => ({
      total: db.users.length,
      paying: db.users.filter(u => u.spent > 0).length,
      vip: db.users.filter(u => u.vip > 0).length,
      blocked: db.users.filter(u => u.status !== 'active').length,
    }),
    [db.users],
  )

  const apply = (action, ids, reason) => {
    const next = { suspend: 'suspended', ban: 'banned', activate: 'active' }[action]
    ids.forEach(id => update('users', id, { status: next, statusReason: reason || '' }))
    log(`${action === 'activate' ? 'Reactivated' : action === 'ban' ? 'Banned' : 'Suspended'} ${ids.length} user(s)${reason ? ` — ${reason}` : ''}`, ids.join(', '))
    toast(`${ids.length} user${ids.length > 1 ? 's' : ''} ${next}`)
  }

  const columns = [
    { key: 'name', label: 'User', sort: u => u.name, render: u => <Who src={u.avatar} name={u.name} sub={`${u.id} · ${u.city}`} /> },
    { key: 'phone', label: 'Phone', render: u => <span className="a-nowrap">{u.phone}</span> },
    { key: 'joined', label: 'Joined', sort: u => u.joined, render: u => <span className="a-nowrap">{date(u.joined)}</span> },
    { key: 'lastActive', label: 'Last active', sort: u => u.lastActive, render: u => <span className="a-muted a-nowrap">{ago(u.lastActive)}</span> },
    { key: 'coins', label: 'Coins', align: 'right', sort: u => u.coins, render: u => num(u.coins) },
    { key: 'spent', label: 'Spent', align: 'right', sort: u => u.spent, render: u => <b className="a-strong">{inr(u.spent)}</b> },
    { key: 'vip', label: 'VIP', sort: u => u.vip, render: u => (u.vip ? <Badge tone="warning">{u.vip >= 4 ? 'Elite' : `VIP ${u.vip}`}</Badge> : <span className="a-faint">—</span>) },
    {
      key: 'status',
      label: 'Status',
      sort: u => u.status,
      render: u => (
        <span className="a-row" style={{ gap: 6 }}>
          <Status value={u.status} />
          {u.verified ? <BadgeCheck size={16} color="var(--info)" aria-label="Verified" /> : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${num(counts.total)} users · ${num(counts.paying)} paying · ${num(counts.vip)} VIP · ${num(counts.blocked)} suspended or banned`}
        actions={
          <Button
            icon={Download}
            onClick={() =>
              exportCsv('rebu-users.csv', rows, [
                { label: 'ID', value: u => u.id },
                { label: 'Name', value: u => u.name },
                { label: 'Phone', value: u => u.phone },
                { label: 'Email', value: u => u.email },
                { label: 'City', value: u => u.city },
                { label: 'Joined', value: u => date(u.joined) },
                { label: 'Coins', value: u => u.coins },
                { label: 'Spent (INR)', value: u => u.spent },
                { label: 'VIP', value: u => u.vip },
                { label: 'Status', value: u => u.status },
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
          onRowClick={u => navigate(`/admin/users/${u.id}`)}
          initialSort={{ key: 'joined', dir: 'desc' }}
          selectable
          bulk={(ids, clear) => (
            <>
              <Button size="sm" icon={RotateCcw} onClick={() => { apply('activate', ids); clear() }}>
                Reactivate
              </Button>
              <Button size="sm" icon={ShieldOff} onClick={() => setConfirm({ action: 'suspend', ids, clear })}>
                Suspend
              </Button>
              <Button size="sm" variant="soft-danger" icon={Ban} onClick={() => setConfirm({ action: 'ban', ids, clear })}>
                Ban
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
                placeholder="Name, ID, phone, email, city"
              />
              <Seg options={STATUS} value={status} onChange={setStatus} />
              <Select
                value={paying}
                onChange={e => setPaying(e.target.value)}
                options={[
                  { value: 'any', label: 'All spenders' },
                  { value: 'paying', label: 'Paying users' },
                  { value: 'free', label: 'Never paid' },
                ]}
              />
              <Select
                value={vip}
                onChange={e => setVip(e.target.value)}
                options={[
                  { value: 'any', label: 'Any VIP' },
                  { value: 'vip', label: 'VIP only' },
                  { value: 'none', label: 'Not VIP' },
                ]}
              />
              <Select
                value={device}
                onChange={e => setDevice(e.target.value)}
                options={[
                  { value: 'any', label: 'All devices' },
                  { value: 'Android', label: 'Android' },
                  { value: 'iOS', label: 'iOS' },
                ]}
              />
            </>
          }
        />
      </Card>

      <Confirm
        open={!!confirm}
        title={confirm?.action === 'ban' ? `Ban ${confirm?.ids.length} user(s)?` : `Suspend ${confirm?.ids.length} user(s)?`}
        message={
          confirm?.action === 'ban'
            ? 'Banned users are signed out and can’t use REBU again with this phone number.'
            : 'Suspended users are signed out until you reactivate them.'
        }
        confirmLabel={confirm?.action === 'ban' ? 'Ban' : 'Suspend'}
        danger
        reason
        onClose={() => setConfirm(null)}
        onConfirm={reason => {
          apply(confirm.action, confirm.ids, reason)
          confirm.clear()
          setConfirm(null)
        }}
      />
    </>
  )
}
