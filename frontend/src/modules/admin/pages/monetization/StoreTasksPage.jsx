import { useState } from 'react'
import { Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { errorText } from '../../api/client'
import { Badge, Button, Card, Field, Input, PageHeader, Select, Switch, Tabs } from '../../components/ui'
import { date, num } from '../../utils/format'

// Three config keys edited here, each saved with PUT /admin/config/:key:
//   storeItems  [{ id, category: frame|entry|bubble, name, emoji, price, days, active }]
//   tasks       { user: [...], host: [...] } — only title/goal/reward/active are editable
//   families    { createCost, joinReward, maxMembers, levelCoins[] }

const CATEGORIES = [
  { value: 'frame', label: 'Avatar frame' },
  { value: 'entry', label: 'Entry effect' },
  { value: 'bubble', label: 'Chat bubble' },
]
const METRIC_LABEL = {
  checkin: 'Daily check-in',
  video_calls: 'Video calls made',
  greetings: 'Greetings sent',
  gifts_sent: 'Gifts sent',
  profile: 'Profile completed',
  following: 'Hosts followed',
  recharged: 'Recharges',
  calls_answered: 'Calls answered',
  live_minutes: 'Minutes live',
  earned_inr: '₹ earned',
}

const posInt = v => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== ''
const int0 = v => Number.isInteger(Number(v)) && Number(v) >= 0 && String(v).trim() !== ''
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Shared save/discard bar, shown while a tab has unsaved edits. */
function SaveBar({ dirty, error, saving, onDiscard, onSave }) {
  if (!dirty) return null
  return (
    <div className="a-bulk" style={{ position: 'sticky', bottom: 16, zIndex: 5, marginTop: 16, boxShadow: 'var(--shadow-lg)' }}>
      {error ? <span className="a-danger">{error}</span> : 'Unsaved changes'}
      <span className="a-spacer" />
      <Button size="sm" variant="ghost" icon={Undo2} disabled={saving} onClick={onDiscard}>
        Discard
      </Button>
      <Button size="sm" variant="primary" icon={Save} disabled={!!error || saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
    </div>
  )
}

/** Edit a copy of one config key; save() PUTs it and toasts. */
function useDraft(key, toForm, fromForm) {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const current = db.config[key]
  const [draft, setDraft] = useState(() => (current === undefined ? null : toForm(current)))
  const [saving, setSaving] = useState(false)
  const dirty = draft !== null && !same(fromForm(draft), current)
  const save = async msg => {
    setSaving(true)
    try {
      const saved = await setConfig(key, fromForm(draft))
      setDraft(toForm(saved))
      toast(msg)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }
  return { current, draft, setDraft, dirty, saving, save, discard: () => setDraft(toForm(current)) }
}

// ── Store items ──────────────────────────────────────────────────────────
const itemToForm = list => list.map(x => ({ ...x, price: String(x.price), days: String(x.days) }))
const itemFromForm = list => list.map(x => ({ ...x, name: x.name.trim(), emoji: x.emoji.trim(), price: Number(x.price), days: Number(x.days) }))

function StoreTab() {
  const s = useDraft('storeItems', itemToForm, itemFromForm)
  if (!s.draft) return <Card>Store items aren’t configured on the server.</Card>
  const rows = s.draft
  const patch = (i, p) => s.setDraft(l => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const errOf = x =>
    !x.name.trim() ? 'Name is required' : !posInt(x.price) ? 'Price must be a whole number of coins' : !posInt(x.days) || Number(x.days) > 365 ? 'Days must be 1–365' : null
  const error = rows.map(errOf).find(Boolean) || null
  const add = () => {
    let n = rows.length + 1
    while (rows.some(x => x.id === `s${n}`)) n += 1
    s.setDraft(l => [...l, { id: `s${n}`, category: 'frame', name: '', emoji: '', price: '99', days: '7', active: false }])
  }

  return (
    <>
      <Card
        title="Store items"
        subtitle="Cosmetics users buy with coins. Prices are in coins; each purchase lasts the given number of days."
        padded={false}
        actions={
          <Button size="sm" icon={Plus} disabled={rows.length >= 100} onClick={add}>
            Add item
          </Button>
        }
      >
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Emoji</th>
                <th>Name</th>
                <th style={{ width: 170 }}>Category</th>
                <th className="right" style={{ width: 180 }}>Price</th>
                <th className="right" style={{ width: 110 }}>Days</th>
                <th style={{ width: 70 }}>Active</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((x, i) => (
                <tr key={x.id}>
                  <td>
                    <Input value={x.emoji} maxLength={16} onChange={e => patch(i, { emoji: e.target.value })} style={{ textAlign: 'center', fontSize: 18 }} />
                  </td>
                  <td>
                    <Input value={x.name} maxLength={40} onChange={e => patch(i, { name: e.target.value })} placeholder="Item name" />
                  </td>
                  <td>
                    <Select value={x.category} onChange={e => patch(i, { category: e.target.value })} options={CATEGORIES} />
                  </td>
                  <td>
                    <Input type="number" min="1" affix="coins" value={x.price} onChange={e => patch(i, { price: e.target.value })} />
                  </td>
                  <td>
                    <Input type="number" min="1" max="365" value={x.days} onChange={e => patch(i, { days: e.target.value })} />
                  </td>
                  <td>
                    <Switch checked={x.active} onChange={v => patch(i, { active: v })} />
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      icon={Trash2}
                      aria-label={`Remove ${x.name || 'item'}`}
                      onClick={() => s.setDraft(l => l.filter((_, j) => j !== i))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <SaveBar dirty={s.dirty} error={error} saving={s.saving} onDiscard={s.discard} onSave={() => s.save('Store items saved')} />
    </>
  )
}

// ── Tasks ────────────────────────────────────────────────────────────────
const taskToForm = t => ({
  user: t.user.map(x => ({ ...x, goal: String(x.goal), reward: String(x.reward) })),
  host: t.host.map(x => ({ ...x, goal: String(x.goal), reward: String(x.reward) })),
})
const taskFromForm = t => ({
  user: t.user.map(x => ({ ...x, title: x.title.trim(), goal: Number(x.goal), reward: Number(x.reward) })),
  host: t.host.map(x => ({ ...x, title: x.title.trim(), goal: Number(x.goal), reward: Number(x.reward) })),
})

function TaskTable({ who, list, onPatch }) {
  return (
    <div className="a-table-wrap">
      <table className="a-table">
        <thead>
          <tr>
            <th>Task</th>
            <th style={{ width: 170 }}>Counts</th>
            <th style={{ width: 90 }}>Group</th>
            <th className="right" style={{ width: 110 }}>Goal</th>
            <th className="right" style={{ width: 180 }}>Reward</th>
            <th style={{ width: 70 }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x, i) => (
            <tr key={x.id}>
              <td>
                <Input value={x.title} maxLength={60} onChange={e => onPatch(who, i, { title: e.target.value })} />
              </td>
              <td className="a-muted">{METRIC_LABEL[x.metric] || x.metric}</td>
              <td>
                <Badge tone={x.group === 'Newbie' ? 'violet' : 'info'}>{x.group}</Badge>
              </td>
              <td>
                <Input type="number" min="1" value={x.goal} onChange={e => onPatch(who, i, { goal: e.target.value })} />
              </td>
              <td>
                <Input type="number" min="1" affix="coins" value={x.reward} onChange={e => onPatch(who, i, { reward: e.target.value })} />
              </td>
              <td>
                <Switch checked={x.active} onChange={v => onPatch(who, i, { active: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TasksTab() {
  const s = useDraft('tasks', taskToForm, taskFromForm)
  if (!s.draft) return <Card>Tasks aren’t configured on the server.</Card>
  const onPatch = (who, i, p) => s.setDraft(t => ({ ...t, [who]: t[who].map((x, j) => (j === i ? { ...x, ...p } : x)) }))
  const all = [...s.draft.user, ...s.draft.host]
  const error =
    all.map(x => (!x.title.trim() ? 'Every task needs a title' : !posInt(x.goal) ? 'Goals must be whole numbers above 0' : !posInt(x.reward) ? 'Rewards must be whole coins above 0' : null)).find(Boolean) ||
    null

  return (
    <>
      <div className="a-stack">
        <Card title="User tasks" subtitle="Daily and newbie tasks users complete for coin rewards. What each task counts is fixed by the app." padded={false}>
          <TaskTable who="user" list={s.draft.user} onPatch={onPatch} />
        </Card>
        <Card title="Host tasks" subtitle="Daily tasks for hosts." padded={false}>
          <TaskTable who="host" list={s.draft.host} onPatch={onPatch} />
        </Card>
      </div>
      <SaveBar dirty={s.dirty} error={error} saving={s.saving} onDiscard={s.discard} onSave={() => s.save('Tasks saved')} />
    </>
  )
}

// ── Families ─────────────────────────────────────────────────────────────
const famToForm = f => ({ ...f, createCost: String(f.createCost), joinReward: String(f.joinReward), maxMembers: String(f.maxMembers) })
const famFromForm = f => ({ ...f, createCost: Number(f.createCost), joinReward: Number(f.joinReward), maxMembers: Number(f.maxMembers) })

function FamiliesTab() {
  const { configMeta } = useStore()
  const s = useDraft('families', famToForm, famFromForm)
  if (!s.draft) return <Card>Families aren’t configured on the server.</Card>
  const f = s.draft
  const set = p => s.setDraft(x => ({ ...x, ...p }))
  const err = {
    createCost: int0(f.createCost) ? null : 'Whole coins, 0 or more',
    joinReward: int0(f.joinReward) ? null : 'Whole coins, 0 or more',
    maxMembers: posInt(f.maxMembers) && Number(f.maxMembers) >= 2 && Number(f.maxMembers) <= 10000 ? null : '2–10,000 members',
  }
  const error = Object.values(err).find(Boolean) || null
  const meta = configMeta.families

  return (
    <>
      <Card title="Families" subtitle={meta?.updatedAt ? `Last changed ${date(meta.updatedAt)}${meta.updatedBy ? ` by ${meta.updatedBy}` : ''}` : 'Groups users create and join.'}>
        <div className="a-grid c3">
          <Field label="Cost to create" error={err.createCost} hint="Charged when a user starts a family">
            <Input type="number" min="0" affix="coins" value={f.createCost} onChange={e => set({ createCost: e.target.value })} />
          </Field>
          <Field label="Join reward" error={err.joinReward} hint="Given to a user on joining">
            <Input type="number" min="0" affix="coins" value={f.joinReward} onChange={e => set({ joinReward: e.target.value })} />
          </Field>
          <Field label="Max members" error={err.maxMembers}>
            <Input type="number" min="2" max="10000" value={f.maxMembers} onChange={e => set({ maxMembers: e.target.value })} />
          </Field>
        </div>
        <div style={{ marginTop: 16 }}>
          <div className="a-label" style={{ marginBottom: 8 }}>
            Level thresholds <span className="a-muted" style={{ fontWeight: 600 }}>· coins gifted by members to reach each level (not editable here)</span>
          </div>
          <div className="a-row wrap" style={{ gap: 8 }}>
            {f.levelCoins.map((c, i) => (
              <Badge key={i} tone="ink">
                Lv {i + 1} · {num(c)}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
      <SaveBar dirty={s.dirty} error={error} saving={s.saving} onDiscard={s.discard} onSave={() => s.save('Family settings saved')} />
    </>
  )
}

export default function StoreTasksPage() {
  const { db } = useStore()
  const [tab, setTab] = useState('store')
  return (
    <>
      <PageHeader title="Store, tasks & families" subtitle="Coin store items, reward tasks and family rules. Saved changes reach the app within a minute." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'store', label: 'Store items', count: db.config.storeItems?.length },
          { value: 'tasks', label: 'Tasks', count: (db.config.tasks?.user.length || 0) + (db.config.tasks?.host.length || 0) },
          { value: 'families', label: 'Families' },
        ]}
      />
      {tab === 'store' ? <StoreTab /> : tab === 'tasks' ? <TasksTab /> : <FamiliesTab />}
    </>
  )
}
