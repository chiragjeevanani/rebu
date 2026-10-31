import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { BadgeCheck, Ban, Download, RotateCcw, ShieldOff } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { useStore } from '../../hooks/useStore'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { Badge, Button, Card, Confirm, DataTable, PageHeader, SearchInput, Seg, Select, Status, Tabs, Who } from '../../components/ui'
import { FrameChip } from '../../components/LevelChips'
import { frameOf } from '../../utils/levels'
import { ago, date, exportCsv, inr, num } from '../../utils/format'

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
]

/** Value that follows `value` after it stops changing for `delay` ms. */
function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

const total = res => res.data?.total ?? 0

export default function UsersPage() {
  const { db } = useStore()
  const toast = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [status, setStatus] = useState('all')
  // 'all' | 'verification' (pending blue-tick requests)
  const [view, setView] = useState(() => (params.get('view') === 'verification' ? 'verification' : 'all'))
  const [vip, setVip] = useState('any')
  const [device, setDevice] = useState('any')
  const [paying, setPaying] = useState('any')
  const [confirm, setConfirm] = useState(null) // { action, ids, clear }
  const term = useDebounced(q.trim())

  const filters = {
    q: term || undefined,
    status: status === 'all' ? undefined : status,
    vip: vip === 'any' ? undefined : vip === 'vip' ? 'vip' : '0',
    device: device === 'any' ? undefined : device,
    paying: paying === 'any' ? undefined : paying === 'paying' ? 'yes' : 'no',
    verification: view === 'verification' ? 'pending' : undefined,
  }
  const pg = usePaging(filters, 20, { key: 'joined', dir: 'desc' })
  const res = useApi('/admin/users', pg.query)
  const rows = res.data?.items

  // Header counts (one-row queries; the server only returns totals per filter).
  const all = useApi('/admin/users', { limit: 1 })
  const payingN = useApi('/admin/users', { limit: 1, paying: 'yes' })
  const vipN = useApi('/admin/users', { limit: 1, vip: 'vip' })
  const suspN = useApi('/admin/users', { limit: 1, status: 'suspended' })
  const banN = useApi('/admin/users', { limit: 1, status: 'banned' })
  const pendingN = useApi('/admin/users', { limit: 1, verification: 'pending' })
  const reloadAll = () => [res, all, suspN, banN, pendingN].forEach(r => r.reload())

  const apply = async (action, ids, reason) => {
    const next = { suspend: 'suspended', ban: 'banned', activate: 'active' }[action]
    try {
      const r = await api.post('/admin/users/bulk-status', { ids, status: next, reason: reason || undefined })
      toast(`${r.updated} user${r.updated === 1 ? '' : 's'} ${next}`)
    } catch (e) {
      toast(errorText(e), 'error')
    }
    reloadAll()
  }

  const exportAll = async () => {
    try {
      const out = []
      for (let page = 1; page <= 50; page += 1) {
        const r = await api.get('/admin/users', { ...filters, page, limit: 100 })
        out.push(...r.items)
        if (page >= r.pages) break
      }
      exportCsv('rebu-users.csv', out, [
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
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const columns = [
    { key: 'name', label: 'User', serverSort: 'name', render: u => <Who src={u.avatar} name={u.name || 'Unnamed'} sub={[u.id, u.city].filter(Boolean).join(' · ')} /> },
    { key: 'phone', label: 'Phone', render: u => <span className="a-nowrap">{u.phone}</span> },
    { key: 'joined', label: 'Joined', serverSort: 'joined', render: u => <span className="a-nowrap">{date(u.joined)}</span> },
    { key: 'lastActive', label: 'Last active', serverSort: 'lastActive', render: u => <span className="a-muted a-nowrap">{ago(u.lastActive)}</span> },
    { key: 'coins', label: 'Coins', align: 'right', serverSort: 'coins', render: u => num(u.coins) },
    { key: 'spent', label: 'Spent', align: 'right', serverSort: 'spent', render: u => <b className="a-strong">{inr(u.spent)}</b> },
    // TODO(api): GET /admin/users → items[].coinsBought (lifetime coins bought → sender frame). The column shows once it's sent.
    ...(rows?.some(u => u.coinsBought != null)
      ? [{ key: 'frame', label: 'Frame', render: u => <FrameChip tier={frameOf(db.config.senderTiers, u.coinsBought)} /> }]
      : []),
    { key: 'vip', label: 'VIP', render: u => (u.vip ? <Badge tone="warning">{u.vip >= 4 ? 'Elite' : `VIP ${u.vip}`}</Badge> : <span className="a-faint">—</span>) },
    {
      key: 'status',
      label: 'Status',
      render: u => (
        <span className="a-row" style={{ gap: 6 }}>
          <Status value={u.status} />
          {u.verified ? <BadgeCheck size={16} color="var(--info)" aria-label="Verified" /> : null}
          {u.verification?.status === 'pending' ? <Badge tone="info">Tick requested</Badge> : null}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Users"
        subtitle={`${num(total(all))} users · ${num(total(payingN))} paying · ${num(total(vipN))} VIP · ${num(total(suspN) + total(banN))} suspended or banned`}
        actions={
          <Button icon={Download} onClick={exportAll}>
            Export CSV
          </Button>
        }
      />
      <Tabs
        value={view}
        onChange={v => {
          setView(v)
          setParams(p => {
            const n = new URLSearchParams(p)
            if (v === 'verification') n.set('view', v)
            else n.delete('view')
            return n
          }, { replace: true })
        }}
        tabs={[
          { value: 'all', label: 'All users' },
          { value: 'verification', label: 'Verification requests', count: total(pendingN) },
        ]}
      />
      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
          onRowClick={u => navigate(`/admin/users/${u.id}`)}
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
                  setParams(p => {
                    const n = new URLSearchParams(p)
                    if (v) n.set('q', v)
                    else n.delete('q')
                    return n
                  }, { replace: true })
                }}
                placeholder="Name, ID, phone, email"
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
