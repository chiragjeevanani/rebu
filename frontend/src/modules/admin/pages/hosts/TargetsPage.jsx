import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Pencil, Plus, Target, Trash2, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Progress,
  SearchInput,
  Seg,
  Select,
  Setting,
  Stat,
  Switch,
  Who,
} from '../../components/ui'
import { date, inr, num } from '../../utils/format'

const PERIODS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

/** Like <Field>, but a div: a <label> around buttons would click the first one when its text is clicked. */
function Group({ label, hint, error, children, compact }) {
  return (
    <div className="a-field" style={compact ? { alignItems: 'flex-start' } : undefined}>
      {label ? <span className="a-label">{label}</span> : null}
      {children}
      {error ? <span className="a-error">{error}</span> : hint ? <span className="a-hint">{hint}</span> : null}
    </div>
  )
}

/** "500 coins" / "120 min" in the metric's unit. */
const amount = (metrics, metric, n) => `${num(n)} ${metrics?.[metric]?.unit || ''}`.trim()

/** What a coin reward is worth once paid into host earnings (bonus commission applies). */
function useRewardInr() {
  const { db } = useStore()
  const { coinInr, commission } = db.config.economy
  return coins => coins * coinInr * (1 - (commission.bonus || 0) / 100)
}

/** Pick one approved host by name, ID or phone. */
function HostPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const term = useDebounced(q.trim())
  const res = useApi(term && !value ? '/admin/hosts' : null, { q: term, limit: 6, status: 'active' })
  const items = res.data?.items || []

  if (value) {
    return (
      <div className="a-row between" style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
        <Who src={value.avatar} name={value.name} sub={value.id} size={30} />
        <Button size="sm" variant="ghost" icon={X} onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    )
  }
  return (
    <div className="a-stack" style={{ gap: 6 }}>
      <SearchInput value={q} onChange={setQ} placeholder="Search hosts by name, ID or phone" />
      {term ? (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', maxHeight: 220, overflowY: 'auto' }}>
          {res.error ? (
            <div className="a-small a-danger" style={{ padding: 10 }}>
              {errorText(res.error)}
            </div>
          ) : res.loading && !items.length ? (
            <div className="a-small a-muted" style={{ padding: 10 }}>
              Searching…
            </div>
          ) : items.length ? (
            items.map(h => (
              <button
                key={h.id}
                type="button"
                className="a-list-row"
                onClick={() => onChange({ id: h.id, name: h.name, avatar: h.avatar })}
                style={{ width: '100%', border: 0, background: 'none', padding: '8px 10px', cursor: 'pointer', textAlign: 'left' }}
              >
                <Who src={h.avatar} name={h.name} sub={`${h.id} · Lv ${h.level}`} size={30} />
              </button>
            ))
          ) : (
            <div className="a-small a-muted" style={{ padding: 10 }}>
              No active host matches “{term}”.
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function TargetModal({ target, metrics, onClose, onSaved }) {
  const toast = useToast()
  const rewardInr = useRewardInr()
  const [f, setF] = useState(() => ({
    title: target?.title || '',
    period: target?.period || 'weekly',
    metric: target?.metric || 'gift_coins',
    goal: target ? String(target.goal) : '',
    reward: target ? String(target.reward) : '',
    scope: target?.hostId ? 'one' : 'all',
    host: target?.hostId ? { id: target.hostId, name: target.hostName || target.hostId, avatar: null } : null,
    active: target ? target.active !== false : true,
  }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const goal = Number(f.goal)
  const reward = Number(f.reward)

  const err = {}
  if (f.title.trim().length < 2) err.title = 'At least 2 characters'
  else if (f.title.trim().length > 60) err.title = 'Up to 60 characters'
  if (!f.goal.trim() || !Number.isInteger(goal) || goal <= 0) err.goal = 'Whole number, more than 0'
  if (!f.reward.trim() || !Number.isInteger(reward) || reward <= 0) err.reward = 'Whole coins, more than 0'
  else if (reward > 1000000) err.reward = 'Up to 1,000,000 coins'
  if (f.scope === 'one' && !f.host) err.host = 'Pick a host'
  const ok = !Object.keys(err).length

  const save = async () => {
    const body = {
      title: f.title.trim(),
      period: f.period,
      metric: f.metric,
      goal,
      reward,
      hostId: f.scope === 'one' ? f.host.id : null,
      active: f.active,
    }
    setSaving(true)
    try {
      const r = target ? await api.patch(`/admin/targets/${target.id}`, body) : await api.post('/admin/targets', body)
      toast(target ? `“${body.title}” saved` : `“${body.title}” created · hosts were notified`)
      onSaved(r.target)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const unit = metrics?.[f.metric]?.unit || ''
  return (
    <Modal
      open
      title={target ? 'Edit target' : 'New target'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok || saving} onClick={save}>
            {saving ? 'Saving…' : target ? 'Save target' : 'Create target'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Title" error={f.title && err.title} hint="Shown to hosts, e.g. “Weekend gift star”">
          <Input value={f.title} maxLength={60} onChange={e => set('title', e.target.value)} autoFocus />
        </Field>
        <div className="a-grid c2">
          <Group compact label="Period" hint={f.period === 'weekly' ? 'Monday to Sunday (IST)' : 'Calendar month (IST)'}>
            <Seg options={PERIODS} value={f.period} onChange={v => set('period', v)} />
          </Group>
          <Field label="Counts">
            <Select
              value={f.metric}
              onChange={e => set('metric', e.target.value)}
              options={Object.entries(metrics || {}).map(([value, m]) => ({ value, label: m.label }))}
            />
          </Field>
        </div>
        <div className="a-grid c2">
          <Field label="Goal" error={f.goal && err.goal} hint={!err.goal ? `${amount(metrics, f.metric, goal)} in one ${f.period === 'weekly' ? 'week' : 'month'}` : null}>
            <Input type="number" min="1" affix={unit} value={f.goal} onChange={e => set('goal', e.target.value)} />
          </Field>
          <Field label="Reward" error={f.reward && err.reward} hint={!err.reward ? `≈ ${inr(rewardInr(reward))} added to the host’s earnings` : null}>
            <Input type="number" min="1" affix="coins" value={f.reward} onChange={e => set('reward', e.target.value)} />
          </Field>
        </div>
        <Group compact label="Who can take part">
          <Seg
            options={[
              { value: 'all', label: 'All hosts' },
              { value: 'one', label: 'One host' },
            ]}
            value={f.scope}
            onChange={v => set('scope', v)}
          />
        </Group>
        {f.scope === 'one' ? (
          <Group error={err.host}>
            <HostPicker value={f.host} onChange={h => set('host', h)} />
          </Group>
        ) : null}
        <Setting title="Active" description="Inactive targets are hidden from hosts and can’t be claimed.">
          <Switch checked={f.active} onChange={v => set('active', v)} />
        </Setting>
        {!target ? <div className="a-small a-muted">Hosts who can take part get a notification when you create the target.</div> : null}
      </div>
    </Modal>
  )
}

function TargetList({ onEdit, onDelete }) {
  const toast = useToast()
  const navigate = useNavigate()
  const rewardInr = useRewardInr()
  const res = useApi('/admin/targets')
  const items = res.data?.items
  const metrics = res.data?.metrics
  const [editing, setEditing] = useState(null) // target | 'new'
  const [deleting, setDeleting] = useState(null)

  const toggle = async t => {
    res.setData(d => ({ ...d, items: d.items.map(x => (x.id === t.id ? { ...x, active: !t.active } : x)) }))
    try {
      await api.patch(`/admin/targets/${t.id}`, { active: !t.active })
      toast(`“${t.title}” ${t.active ? 'paused' : 'activated'}`)
    } catch (e) {
      toast(errorText(e), 'error')
      res.reload()
    }
  }

  const remove = async () => {
    const t = deleting
    setDeleting(null)
    try {
      await api.del(`/admin/targets/${t.id}`)
      toast(`“${t.title}” deleted`)
      res.reload()
      onDelete?.(t)
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const active = (items || []).filter(t => t.active)
  const claimed = (items || []).reduce((n, t) => n + (t.claimedThisPeriod || 0), 0)

  const columns = [
    {
      key: 'title',
      label: 'Target',
      sort: t => t.title.toLowerCase(),
      render: t => (
        <span className="a-stack" style={{ gap: 2 }}>
          <b className="a-strong">{t.title}</b>
          <span className="a-small a-muted">{t.metricLabel || metrics?.[t.metric]?.label}</span>
        </span>
      ),
    },
    {
      key: 'period',
      label: 'Period',
      sort: t => t.period,
      render: t => (
        <span className="a-stack" style={{ gap: 2 }}>
          <Badge tone={t.period === 'weekly' ? 'info' : 'violet'}>{t.period === 'weekly' ? 'Weekly' : 'Monthly'}</Badge>
          {t.endsAt ? <span className="a-small a-muted a-nowrap">ends {date(t.endsAt)}</span> : null}
        </span>
      ),
    },
    { key: 'goal', label: 'Goal', align: 'right', sort: t => t.goal, render: t => <span className="a-nowrap">{amount(metrics, t.metric, t.goal)}</span> },
    {
      key: 'reward',
      label: 'Reward',
      align: 'right',
      sort: t => t.reward,
      render: t => (
        <span className="a-stack a-nowrap" style={{ gap: 2, alignItems: 'flex-end' }}>
          <b className="a-strong">{num(t.reward)} coins</b>
          <span className="a-small a-muted">≈ {inr(rewardInr(t.reward))}</span>
        </span>
      ),
    },
    {
      key: 'scope',
      label: 'Hosts',
      render: t => (t.hostId ? <Who name={t.hostName || t.hostId} sub="One host" size={28} to={`/admin/hosts/${t.hostId}`} /> : <span className="a-muted">All hosts</span>),
    },
    { key: 'claimed', label: 'Claimed', align: 'right', sort: t => t.claimedThisPeriod || 0, render: t => <span title="This period">{num(t.claimedThisPeriod || 0)}</span> },
    {
      key: 'active',
      label: 'Active',
      render: t => (
        <span onClick={e => e.stopPropagation()}>
          <Switch checked={t.active} onChange={() => toggle(t)} />
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: t => (
        <span className="a-row a-nowrap" style={{ gap: 2, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" iconOnly icon={Pencil} onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`} />
          <Button size="sm" variant="ghost" iconOnly icon={Trash2} onClick={() => setDeleting(t)} aria-label={`Delete ${t.title}`} />
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Host targets"
        subtitle="Weekly and monthly goals. Hosts who reach one claim its coin reward, which is paid into their earnings."
        crumbs={[{ label: 'Hosts', to: '/admin/hosts' }, { label: 'Targets' }]}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')} disabled={!metrics}>
            New target
          </Button>
        }
      />

      <div className="a-grid c3" style={{ marginBottom: 20 }}>
        <Stat label="Active targets" value={items ? num(active.length) : '—'} sub={items ? `${num(items.length)} in total` : null} />
        <Stat label="Claimed this period" value={items ? num(claimed) : '—'} sub="across all targets" />
        <Stat
          label="Rewards claimed"
          value={items ? `${num((items || []).reduce((n, t) => n + (t.claimedThisPeriod || 0) * t.reward, 0))} coins` : '—'}
          sub="this period"
        />
      </div>

      <Card padded={false}>
        {res.error && !items ? (
          <ErrorState error={res.error} onRetry={res.reload} />
        ) : !items ? (
          <Loading />
        ) : (
          <DataTable
            columns={columns}
            rows={items}
            onRowClick={t => navigate(`/admin/host-targets/${t.id}`)}
            empty={<Empty icon={Target} title="No targets yet" text="Create a weekly or monthly goal to give hosts something to aim for." />}
          />
        )}
      </Card>

      {editing ? (
        <TargetModal
          target={editing === 'new' ? null : editing}
          metrics={metrics}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            res.reload()
            onEdit?.()
          }}
        />
      ) : null}

      <Confirm
        open={!!deleting}
        title={`Delete “${deleting?.title}”?`}
        message="Hosts stop seeing this target right away. Rewards already claimed stay in their earnings. To stop it for now, switch it off instead."
        confirmLabel="Delete target"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </>
  )
}

function TargetDetail({ id }) {
  const toast = useToast()
  const navigate = useNavigate()
  const rewardInr = useRewardInr()
  const res = useApi(`/admin/targets/${id}`)
  const metricsRes = useApi('/admin/targets')
  const metrics = metricsRes.data?.metrics
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [show, setShow] = useState('all')

  const t = res.data?.target
  const hosts = useMemo(() => res.data?.hosts || [], [res.data])
  const rows = useMemo(
    () =>
      hosts
        .filter(h => show === 'all' || (show === 'done' ? h.done : show === 'claimed' ? h.claimed : !h.done))
        .map(h => ({ ...h, state: h.claimed ? 2 : h.done ? 1 : 0 })),
    [hosts, show],
  )

  if (res.error && !res.data) {
    return (
      <>
        <PageHeader title="Target" crumbs={[{ label: 'Hosts', to: '/admin/hosts' }, { label: 'Targets', to: '/admin/host-targets' }, { label: 'Not found' }]} />
        <div className="a-card">
          <ErrorState error={res.error} onRetry={res.reload} title="Couldn’t load this target" />
        </div>
      </>
    )
  }
  if (!t) {
    return (
      <div className="a-card">
        <Loading />
      </div>
    )
  }

  const done = hosts.filter(h => h.done).length
  const claimed = hosts.filter(h => h.claimed).length

  const remove = async () => {
    setDeleting(false)
    try {
      await api.del(`/admin/targets/${t.id}`)
      toast(`“${t.title}” deleted`)
      navigate('/admin/host-targets')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  const columns = [
    { key: 'name', label: 'Host', sort: h => h.name.toLowerCase(), render: h => <Who src={h.avatar} name={h.name} sub={h.id} to={`/admin/hosts/${h.id}`} /> },
    {
      key: 'progress',
      label: 'Progress',
      sort: h => h.progress,
      render: h => (
        <span className="a-stack" style={{ gap: 6, minWidth: 180 }}>
          <span className="a-small">
            <b className="a-strong">{num(h.progress)}</b> / {amount(metrics, t.metric, t.goal)}
          </span>
          <Progress value={h.progress / t.goal} />
        </span>
      ),
    },
    {
      key: 'state',
      label: 'Status',
      sort: h => h.state,
      render: h =>
        h.claimed ? <Badge tone="success" dot>Claimed</Badge>
        : h.done ? <Badge tone="warning" dot>Reached · not claimed</Badge>
        : <Badge tone="neutral">In progress · {Math.floor((h.progress / t.goal) * 100)}%</Badge>,
    },
  ]

  return (
    <>
      <PageHeader
        title={
          <span className="a-row wrap" style={{ gap: 10 }}>
            {t.title}
            <Badge tone={t.period === 'weekly' ? 'info' : 'violet'}>{t.period === 'weekly' ? 'Weekly' : 'Monthly'}</Badge>
            {!t.active ? <Badge tone="warning">Paused</Badge> : null}
          </span>
        }
        subtitle={`${t.metricLabel || ''} · goal ${amount(metrics, t.metric, t.goal)} · reward ${num(t.reward)} coins (≈ ${inr(rewardInr(t.reward))}) · ${t.hostId ? `only ${t.hostName || t.hostId}` : 'all hosts'}`}
        crumbs={[{ label: 'Hosts', to: '/admin/hosts' }, { label: 'Targets', to: '/admin/host-targets' }, { label: t.title }]}
        actions={
          <>
            <Button icon={Trash2} variant="soft-danger" onClick={() => setDeleting(true)}>
              Delete
            </Button>
            <Button icon={Pencil} variant="primary" onClick={() => setEditing(true)} disabled={!metrics}>
              Edit
            </Button>
          </>
        }
      />

      <div className="a-grid c4" style={{ marginBottom: 20 }}>
        <Stat label="Hosts taking part" value={num(hosts.length)} sub={t.hostId ? 'one host' : 'active hosts'} />
        <Stat label="Reached the goal" value={num(done)} sub={hosts.length ? `${Math.round((done / hosts.length) * 100)}% of hosts` : null} />
        <Stat label="Claimed" value={num(claimed)} sub={`${num(claimed * t.reward)} coins paid`} />
        <Stat label="Period ends" value={t.endsAt ? date(t.endsAt) : '—'} sub={t.periodKey ? `period ${t.periodKey}` : null} />
      </div>

      <Card padded={false} title="Progress this period" subtitle="Counted from the start of the current week or month (IST)">
        <DataTable
          columns={columns}
          rows={rows}
          initialSort={{ key: 'progress', dir: 'desc' }}
          toolbar={
            <Seg
              options={[
                { value: 'all', label: `All ${hosts.length}` },
                { value: 'progress', label: `In progress ${hosts.length - done}` },
                { value: 'done', label: `Reached ${done}` },
                { value: 'claimed', label: `Claimed ${claimed}` },
              ]}
              value={show}
              onChange={setShow}
            />
          }
          empty={<Empty title="No hosts here" text={show === 'all' ? 'No active host takes part in this target.' : 'Try another filter.'} />}
        />
      </Card>

      {editing ? (
        <TargetModal
          target={t}
          metrics={metrics}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            res.reload()
          }}
        />
      ) : null}

      <Confirm
        open={deleting}
        title={`Delete “${t.title}”?`}
        message="Hosts stop seeing this target right away. Rewards already claimed stay in their earnings."
        confirmLabel="Delete target"
        danger
        onClose={() => setDeleting(false)}
        onConfirm={remove}
      />
    </>
  )
}

export default function TargetsPage() {
  const { id } = useParams()
  return id ? <TargetDetail key={id} id={id} /> : <TargetList />
}
