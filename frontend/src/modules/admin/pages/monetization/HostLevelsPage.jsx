import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Trash2, Wand2, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { useApi } from '../../hooks/useApi'
import { errorText } from '../../api/client'
import { Badge, Button, Card, Confirm, Field, Input, Modal, PageHeader, Seg, Select } from '../../components/ui'
import { BarList } from '../../components/charts'
import SaveBar from '../../components/SaveBar'
import { CategoryChip, ColorInput } from '../../components/LevelChips'
import { categoryOf, isHex, slugKey } from '../../utils/levels'
import { inr, num, pct } from '../../utils/format'

const CAT_FIELDS = [
  { key: 'fromLevel', label: 'Starts at level', unit: 'lv', pad: 40 },
  { key: 'maxRate', label: 'Price cap', unit: 'coins/min', pad: 86 },
  { key: 'commissionDiscount', label: 'Commission discount', unit: '%', pad: 36 },
]

const toDraft = (cats, levels, tiers) => ({
  cats: cats.map(c => ({
    key: c.key,
    name: c.name,
    color: c.color,
    fromLevel: String(c.fromLevel),
    maxRate: String(c.maxRate),
    commissionDiscount: String(c.commissionDiscount),
  })),
  levels: levels.map(l => ({ level: l.level, giftCoins: String(l.giftCoins) })),
  video: [...tiers.video],
  voice: [...tiers.voice],
})

const toNum = s => (String(s).trim() === '' ? NaN : Number(s))

// Round generated thresholds to numbers an admin would type.
const nice = n => (n >= 10000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : Math.round(n / 10) * 10)

function TierEditor({ title, kind, tiers, saved, usage, onChange }) {
  const [value, setValue] = useState('')
  const n = Number(value)
  const error =
    value === '' ? null
    : !Number.isInteger(n) || n <= 0 ? 'Whole number of coins, more than 0'
    : tiers.includes(n) ? 'Already in the list'
    : null
  const add = () => {
    if (value === '' || error) return
    onChange([...tiers, n].sort((a, b) => a - b))
    setValue('')
  }
  // Removed tiers that hosts are still charging.
  const orphaned = saved.filter(t => !tiers.includes(t) && usage[t])

  return (
    <Card title={title} subtitle={`Prices hosts can pick for ${kind} calls, in coins per minute`}>
      <div className="a-row wrap" style={{ gap: 8, marginBottom: 14 }}>
        {tiers.length ? (
          tiers.map(t => {
            const isNew = !saved.includes(t)
            return (
              <span
                key={t}
                className="a-row"
                style={{
                  gap: 4,
                  height: 30,
                  padding: '0 4px 0 10px',
                  borderRadius: 15,
                  fontWeight: 700,
                  background: isNew ? 'var(--warning-soft)' : 'var(--surface-2)',
                  color: isNew ? 'var(--warning)' : 'var(--text)',
                }}
                title={usage[t] ? `${usage[t]} host(s) charge ${t}` : undefined}
              >
                {num(t)}
                <button
                  type="button"
                  onClick={() => onChange(tiers.filter(x => x !== t))}
                  aria-label={`Remove ${t}`}
                  style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'grid', placeItems: 'center', padding: 4 }}
                >
                  <X size={13} />
                </button>
              </span>
            )
          })
        ) : (
          <span className="a-danger a-small">Add at least one price.</span>
        )}
      </div>
      <form
        className="a-row"
        style={{ alignItems: 'flex-start' }}
        onSubmit={e => {
          e.preventDefault()
          add()
        }}
      >
        <Field error={error} style={{ flex: 1 }}>
          <Input type="number" min="1" affix="coins" placeholder="Add a price" value={value} onChange={e => setValue(e.target.value)} />
        </Field>
        <Button type="submit" icon={Plus} disabled={value === '' || !!error}>
          Add
        </Button>
      </form>
      {orphaned.length ? (
        <div className="a-row a-small a-warning" style={{ alignItems: 'flex-start', gap: 6, marginTop: 10 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {orphaned.map(t => `${usage[t]} host${usage[t] === 1 ? '' : 's'} at ${t}`).join(', ')} will need to pick a new price.
          </span>
        </div>
      ) : null}
    </Card>
  )
}

/** Regenerates gift-coin thresholds on a growth curve. */
function FillModal({ open, levels, onClose, onApply }) {
  // Start from the growth rate of the current table so "Fill" with defaults keeps its shape.
  const [f, setF] = useState(() => {
    const n = levels.length
    const first = levels[1] && levels[0] ? levels[1].giftCoins - levels[0].giftCoins : 0
    const last = n >= 3 ? levels[n - 1].giftCoins - levels[n - 2].giftCoins : 0
    const g = n > 3 && first > 0 && last > 0 ? (Math.pow(last / first, 1 / (n - 2)) - 1) * 100 : 10
    return { count: String(Math.max(2, n)), second: String(first > 0 ? first : 500), growth: String(Math.max(0.5, Math.round(g * 2) / 2)) }
  })
  if (!open) return null
  const count = toNum(f.count)
  const second = toNum(f.second)
  const growth = toNum(f.growth)
  const err = {}
  if (!Number.isInteger(count) || count < 2 || count > 200) err.count = '2–200 levels'
  if (!Number.isInteger(second) || second <= 0) err.second = 'Whole coins, more than 0'
  if (!Number.isFinite(growth) || growth <= 0 || growth > 200) err.growth = 'More than 0, up to 200%'
  const ok = !Object.keys(err).length

  const build = () => {
    const out = [0]
    let step = second
    for (let lv = 2; lv <= count; lv++) {
      const next = Math.max(nice(out[out.length - 1] + step), out[out.length - 1] + 10)
      out.push(next)
      step *= 1 + growth / 100
    }
    return out
  }
  const result = ok ? build() : []

  return (
    <Modal
      open
      title="Fill levels"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={() => onApply(result)}>
            Fill {ok ? num(count) : ''} levels
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <p className="a-muted">
          Replaces the gift coins needed for every level. Each step up costs more than the one before by the growth rate. You can still edit single
          levels afterwards, and nothing is saved until you press Save.
        </p>
        <div className="a-grid c3">
          <Field label="Number of levels" error={err.count}>
            <Input type="number" min="2" max="200" value={f.count} onChange={e => setF(x => ({ ...x, count: e.target.value }))} />
          </Field>
          <Field label="Level 2 needs" error={err.second}>
            <Input type="number" min="1" affix="coins" value={f.second} onChange={e => setF(x => ({ ...x, second: e.target.value }))} />
          </Field>
          <Field label="Growth per level" error={err.growth}>
            <Input type="number" min="0.5" step="0.5" affix="%" value={f.growth} onChange={e => setF(x => ({ ...x, growth: e.target.value }))} />
          </Field>
        </div>
        {ok ? (
          <div className="a-small a-muted">
            Level 2: <b className="a-strong">{num(result[1])}</b> · level {Math.min(10, count)}: <b className="a-strong">{num(result[Math.min(10, count) - 1])}</b> ·
            level {count}: <b className="a-strong">{num(result[count - 1])}</b> gift coins
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

export default function HostLevelsPage() {
  const { db, setConfig, refreshConfig } = useStore()
  const toast = useToast()
  const { hostCategories, hostLevels, rateTiers, economy } = db.config
  const [draft, setDraft] = useState(() => toDraft(hostCategories, hostLevels, rateTiers))
  const [removing, setRemoving] = useState(false)
  const [filling, setFilling] = useState(false)
  const [preview, setPreview] = useState({ level: '1', type: 'video' })
  const [saving, setSaving] = useState(false)
  // Per-level and price-usage counts across all active approved hosts.
  const hostsRes = useApi('/admin/hosts/stats')
  const stats = hostsRes.data
  const hostTotal = stats?.total ?? 0

  const cats = useMemo(
    () =>
      draft.cats.map(c => ({
        key: c.key.trim(),
        name: c.name.trim(),
        color: c.color.trim().toUpperCase(),
        fromLevel: toNum(c.fromLevel),
        maxRate: toNum(c.maxRate),
        commissionDiscount: toNum(c.commissionDiscount),
      })),
    [draft.cats],
  )
  const levels = useMemo(() => draft.levels.map(l => ({ level: l.level, giftCoins: toNum(l.giftCoins) })), [draft.levels])
  // Categories with usable start levels, for chips and the preview while the admin is mid-edit.
  const validCats = useMemo(() => cats.filter(c => Number.isInteger(c.fromLevel)), [cats])
  const catOf = lv => categoryOf(validCats, lv)
  const topLevel = levels[levels.length - 1]?.level || 1

  const errors = useMemo(() => {
    const out = {}
    const put = (k, m) => (out[k] = m)
    cats.forEach((c, i) => {
      const prev = cats[i - 1]
      if (!c.name) put(`c${i}.name`, 'Required')
      else if (c.name.length > 30) put(`c${i}.name`, 'Up to 30 characters')
      if (!/^[a-z0-9_-]{1,24}$/.test(c.key)) put(`c${i}.key`, 'a–z, 0–9, _ or -')
      else if (cats.findIndex(x => x.key === c.key) !== i) put(`c${i}.key`, 'Key already used')
      if (!isHex(c.color)) put(`c${i}.color`, 'Use #RRGGBB')
      if (!Number.isInteger(c.fromLevel) || c.fromLevel < 1) put(`c${i}.fromLevel`, 'Whole level, 1 or more')
      else if (i === 0 && c.fromLevel !== 1) put(`c${i}.fromLevel`, 'First category starts at level 1')
      else if (prev && Number.isFinite(prev.fromLevel) && c.fromLevel <= prev.fromLevel) put(`c${i}.fromLevel`, `After ${prev.name || 'the previous'} (${prev.fromLevel})`)
      if (!Number.isInteger(c.maxRate) || c.maxRate <= 0) put(`c${i}.maxRate`, 'Whole coins, more than 0')
      if (!Number.isFinite(c.commissionDiscount) || c.commissionDiscount < 0 || c.commissionDiscount > 90) put(`c${i}.commissionDiscount`, '0–90%')
    })
    levels.forEach((l, i) => {
      const prev = levels[i - 1]
      if (!Number.isInteger(l.giftCoins) || l.giftCoins < 0) put(`l${i}`, 'Whole coins, 0 or more')
      else if (i === 0 && l.giftCoins !== 0) put(`l${i}`, 'Level 1 starts at 0')
      else if (prev && Number.isFinite(prev.giftCoins) && l.giftCoins <= prev.giftCoins) put(`l${i}`, `More than level ${prev.level} (${num(prev.giftCoins)})`)
    })
    if (!draft.video.length) out.video = 'Add at least one video price'
    if (!draft.voice.length) out.voice = 'Add at least one voice price'
    return out
  }, [cats, levels, draft.video, draft.voice])

  // Every individual change per config key, shown in the save bar count.
  const catChanges = useMemo(() => {
    const out = []
    cats.forEach(c => {
      const old = hostCategories.find(x => x.key === c.key)
      if (!old) return out.push(`added category ${c.name || c.key}`)
      if (c.name !== old.name) out.push(`${old.name} renamed to ${c.name}`)
      if (c.color !== old.color.toUpperCase()) out.push(`${c.name} colour ${old.color} → ${c.color}`)
      for (const f of CAT_FIELDS) if (c[f.key] !== old[f.key]) out.push(`${c.name} ${f.label.toLowerCase()} ${old[f.key]} → ${c[f.key]}`)
    })
    hostCategories.filter(o => !cats.some(c => c.key === o.key)).forEach(o => out.push(`removed category ${o.name}`))
    return out
  }, [cats, hostCategories])

  const levelChanges = useMemo(() => {
    const out = []
    levels.forEach(l => {
      const old = hostLevels.find(x => x.level === l.level)
      if (!old) out.push(`added level ${l.level}`)
      else if (l.giftCoins !== old.giftCoins) out.push(`level ${l.level} gift coins ${num(old.giftCoins)} → ${num(l.giftCoins)}`)
    })
    hostLevels.filter(o => !levels.some(l => l.level === o.level)).forEach(o => out.push(`removed level ${o.level}`))
    return out
  }, [levels, hostLevels])

  const tierChanges = useMemo(() => {
    const out = []
    for (const kind of ['video', 'voice']) {
      const added = draft[kind].filter(t => !rateTiers[kind].includes(t))
      const removed = rateTiers[kind].filter(t => !draft[kind].includes(t))
      if (added.length || removed.length) out.push(`${kind} prices ${[...added.map(t => `+${t}`), ...removed.map(t => `−${t}`)].join(' ')}`)
    }
    return out
  }, [draft, rateTiers])

  const changes = [...catChanges, ...levelChanges, ...tierChanges]
  const dirty = changes.length > 0
  const invalid = Object.keys(errors).length

  const hostsPerCategory = useMemo(() => {
    const counts = {}
    for (const [lv, n] of Object.entries(stats?.byLevel || {})) {
      const c = categoryOf(validCats, Number(lv))
      if (c) counts[c.key] = (counts[c.key] || 0) + n
    }
    return validCats.map(c => ({ label: c.name || c.key, value: counts[c.key] || 0 }))
  }, [stats, validCats])

  const usage = useMemo(() => ({ video: stats?.byRate?.video || {}, voice: stats?.byRate?.voice || {} }), [stats])

  const setCat = (i, k, v) => setDraft(d => ({ ...d, cats: d.cats.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }))
  const setCatName = (i, v) =>
    setDraft(d => ({
      ...d,
      // New categories take their key from the name until saved.
      cats: d.cats.map((c, j) => (j === i ? { ...c, name: v, ...(c.isNew ? { key: slugKey(v) } : null) } : c)),
    }))
  const addCat = () => {
    const last = cats[cats.length - 1]
    const nextTier = draft.video.find(t => t > (last?.maxRate || 0))
    setDraft(d => ({
      ...d,
      cats: [
        ...d.cats,
        {
          isNew: true,
          key: '',
          name: '',
          color: '#6B7280',
          fromLevel: String((last?.fromLevel || 0) + 5),
          maxRate: String(nextTier || (last?.maxRate || 0) + 50),
          commissionDiscount: String(last?.commissionDiscount || 0),
        },
      ],
    }))
  }
  const removeCat = i => setDraft(d => ({ ...d, cats: d.cats.filter((_, j) => j !== i) }))

  const setLevel = (i, v) => setDraft(d => ({ ...d, levels: d.levels.map((l, j) => (j === i ? { ...l, giftCoins: v } : l)) }))
  const addLevel = () => {
    const top = levels[levels.length - 1]
    const prev = levels[levels.length - 2]
    const step = top && prev && Number.isFinite(top.giftCoins) && Number.isFinite(prev.giftCoins) ? top.giftCoins - prev.giftCoins : 500
    setDraft(d => ({
      ...d,
      levels: [...d.levels, { level: (top?.level || 0) + 1, giftCoins: String(top ? nice((top.giftCoins || 0) + step * 1.2) : 0) }],
    }))
  }
  const fill = coins => {
    setDraft(d => ({ ...d, levels: coins.map((c, i) => ({ level: i + 1, giftCoins: String(c) })) }))
    setFilling(false)
  }

  const top = levels[levels.length - 1]
  const hostsAtTop = top ? stats?.byLevel?.[top.level] || 0 : 0

  const save = async () => {
    setSaving(true)
    try {
      const sortNum = list => [...list].sort((a, b) => a - b)
      if (catChanges.length) await setConfig('hostCategories', cats)
      if (levelChanges.length) await setConfig('hostLevels', levels.map(l => ({ level: l.level, giftCoins: l.giftCoins })))
      if (tierChanges.length) await setConfig('rateTiers', { video: sortNum(draft.video), voice: sortNum(draft.voice) })
      // Levels carry their category's cap and discount; re-read so every page sees the new values.
      const cfg = await refreshConfig()
      setDraft(toDraft(cfg.hostCategories, cfg.hostLevels, cfg.rateTiers))
      toast(`Host levels saved · ${changes.length} change${changes.length === 1 ? '' : 's'}`)
      hostsRes.reload()
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  // ---- Preview
  const pv = levels.find(l => String(l.level) === preview.level) || levels[0]
  const pvCat = pv ? catOf(pv.level) : null
  const cap = pvCat && Number.isFinite(pvCat.maxRate) ? pvCat.maxRate : 0
  const discount = Number.isFinite(pvCat?.commissionDiscount) ? pvCat.commissionDiscount : 0
  const allowed = draft[preview.type].filter(t => t <= cap)
  const best = allowed.length ? allowed[allowed.length - 1] : null
  const rate = Math.max(0, economy.commission[preview.type] - discount)
  const netPerMin = best ? best * economy.coinInr * (1 - rate / 100) : 0

  return (
    <>
      <PageHeader
        title="Host levels & prices"
        subtitle="Hosts level up with the gift coins they receive. Each level belongs to a category that sets the highest per-minute price and a commission discount."
        crumbs={[{ label: 'Monetization' }, { label: 'Host levels' }]}
      />

      <Card
        padded={false}
        style={{ marginBottom: 20 }}
        title="Categories"
        subtitle="A category covers every level from its starting level up to the next category’s"
        actions={
          <Button size="sm" variant="primary" icon={Plus} disabled={draft.cats.length >= 12} onClick={addCat}>
            Add category
          </Button>
        }
      >
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Colour</th>
                <th>Levels</th>
                {CAT_FIELDS.map(f => (
                  <th key={f.key}>{f.label}</th>
                ))}
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {draft.cats.map((row, i) => {
                const c = cats[i]
                const old = row.isNew ? null : hostCategories.find(x => x.key === row.key)
                const next = cats[i + 1]
                const span = Number.isInteger(c.fromLevel)
                  ? `Levels ${c.fromLevel}–${next && Number.isInteger(next.fromLevel) ? next.fromLevel - 1 : topLevel}`
                  : null
                const unreachable = Number.isInteger(c.fromLevel) && c.fromLevel > topLevel
                return (
                  <tr key={i}>
                    <td style={{ verticalAlign: 'top', minWidth: 200 }}>
                      <Field
                        error={errors[`c${i}.name`] || errors[`c${i}.key`]}
                        hint={
                          unreachable ? <span className="a-warning">Starts above the top level ({topLevel})</span>
                          : old && c.name !== old.name ? `Was ${old.name}`
                          : <span className="a-mono">{c.key || 'key'}</span>
                        }
                      >
                        <span className="a-row" style={{ gap: 6 }}>
                          <Input value={row.name} placeholder="e.g. Gold" maxLength={30} onChange={e => setCatName(i, e.target.value)} />
                          {!old ? <Badge tone="warning">New</Badge> : null}
                        </span>
                      </Field>
                    </td>
                    <td style={{ verticalAlign: 'top' }}>
                      <Field error={errors[`c${i}.color`]}>
                        <ColorInput value={row.color} invalid={!!errors[`c${i}.color`]} onChange={v => setCat(i, 'color', v)} />
                      </Field>
                    </td>
                    <td className="a-nowrap" style={{ verticalAlign: 'top', paddingTop: 22 }}>
                      {span ? <CategoryChip category={{ ...c, color: isHex(c.color) ? c.color : '#6B7280', name: span }} /> : '—'}
                    </td>
                    {CAT_FIELDS.map(f => {
                      const edited = old && c[f.key] !== old[f.key]
                      const err = errors[`c${i}.${f.key}`]
                      const warn = f.key === 'maxRate' && !err && !draft.video.includes(c.maxRate) ? 'Not a video price tier' : null
                      return (
                        <td key={f.key} style={{ verticalAlign: 'top', minWidth: f.key === 'maxRate' ? 170 : 120 }}>
                          <Field error={err} hint={warn ? <span className="a-warning">{warn}</span> : edited ? `Was ${num(old[f.key])}` : null}>
                            <Input
                              type="number"
                              min="0"
                              affix={f.unit}
                              value={row[f.key]}
                              disabled={f.key === 'fromLevel' && i === 0}
                              onChange={e => setCat(i, f.key, e.target.value)}
                              style={{ paddingRight: f.pad, ...(edited ? { borderColor: 'var(--warning)' } : null) }}
                            />
                          </Field>
                        </td>
                      )
                    })}
                    <td style={{ verticalAlign: 'top' }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={Trash2}
                        disabled={i === 0}
                        title={i === 0 ? 'The first category can’t be removed' : undefined}
                        onClick={() => removeCat(i)}
                        aria-label={`Remove ${c.name || 'category'}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <div className="a-stack">
          <Card
            padded={false}
            title="Levels"
            subtitle={`${levels.length} levels · gift coins received (lifetime) to reach each level; must go up every level`}
            actions={
              <span className="a-row wrap" style={{ gap: 6 }}>
                <Button size="sm" icon={Wand2} onClick={() => setFilling(true)}>
                  Fill levels
                </Button>
                <Button size="sm" icon={Trash2} disabled={levels.length <= 1} onClick={() => setRemoving(true)}>
                  Remove top level
                </Button>
                <Button size="sm" variant="primary" icon={Plus} disabled={levels.length >= 200} onClick={addLevel}>
                  Add level
                </Button>
              </span>
            }
          >
            <div className="a-table-wrap" style={{ maxHeight: 620, overflowY: 'auto' }}>
              <table className="a-table">
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--surface)' }}>
                  <tr>
                    <th style={{ width: 110 }}>Level</th>
                    <th>Category</th>
                    <th>Gift coins needed</th>
                    <th className="right">Price cap</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.levels.map((row, i) => {
                    const old = hostLevels.find(x => x.level === row.level)
                    const l = levels[i]
                    const c = catOf(row.level)
                    const edited = old && l.giftCoins !== old.giftCoins
                    const err = errors[`l${i}`]
                    const firstOfCat = c && c.fromLevel === row.level
                    return (
                      <tr key={row.level} style={firstOfCat && i > 0 ? { borderTop: `2px solid ${c.color}` } : undefined}>
                        <td style={{ verticalAlign: 'top', paddingTop: 18 }}>
                          <span className="a-row" style={{ gap: 6 }}>
                            <b className="a-strong">Level {row.level}</b>
                            {!old ? <Badge tone="warning">New</Badge> : null}
                          </span>
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 16 }}>
                          <CategoryChip category={c} />
                        </td>
                        <td style={{ verticalAlign: 'top', minWidth: 200 }}>
                          <Field error={err} hint={edited ? `Was ${num(old.giftCoins)}` : null}>
                            <Input
                              type="number"
                              min="0"
                              affix="coins"
                              value={row.giftCoins}
                              disabled={i === 0}
                              onChange={e => setLevel(i, e.target.value)}
                              style={edited ? { borderColor: 'var(--warning)' } : undefined}
                            />
                          </Field>
                        </td>
                        <td className="right a-muted" style={{ verticalAlign: 'top', paddingTop: 18 }}>
                          {c && Number.isFinite(c.maxRate) ? `${num(c.maxRate)} coins/min` : '—'}
                          {c?.commissionDiscount ? ` · ${c.commissionDiscount}% off` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="a-grid c2">
            <TierEditor
              title="Video call prices"
              kind="video"
              tiers={draft.video}
              saved={rateTiers.video}
              usage={usage.video}
              onChange={v => setDraft(d => ({ ...d, video: v }))}
            />
            <TierEditor
              title="Voice call prices"
              kind="voice"
              tiers={draft.voice}
              saved={rateTiers.voice}
              usage={usage.voice}
              onChange={v => setDraft(d => ({ ...d, voice: v }))}
            />
          </div>
        </div>

        <div className="a-stack">
          <Card title="Preview" subtitle={dirty ? 'Using your unsaved values' : 'Using saved values'}>
            <div className="a-stack">
              <div className="a-row wrap">
                <Select
                  value={preview.level}
                  onChange={e => setPreview(p => ({ ...p, level: e.target.value }))}
                  options={levels.map(l => ({ value: String(l.level), label: `Level ${l.level}` }))}
                  style={{ width: 'auto' }}
                />
                <Seg
                  options={[
                    { value: 'video', label: 'Video' },
                    { value: 'voice', label: 'Voice' },
                  ]}
                  value={preview.type}
                  onChange={type => setPreview(p => ({ ...p, type }))}
                />
              </div>
              {pv ? (
                <>
                  <div className="a-row wrap" style={{ gap: 8 }}>
                    <CategoryChip category={pvCat} />
                    <span className="a-small a-muted">
                      reached at {Number.isFinite(pv.giftCoins) ? num(pv.giftCoins) : '—'} gift coins
                    </span>
                  </div>
                  <p style={{ fontSize: 15 }}>
                    A level-{pv.level} host can charge up to{' '}
                    <b className="a-strong">{best ? `${num(best)} coins/min` : 'nothing (no price fits the cap)'}</b> for {preview.type}.
                  </p>
                </>
              ) : null}
              {best ? (
                <div className="a-small a-muted">
                  At that price they take home about <b className="a-strong">{inr(netPerMin)}</b> per minute ({pct(rate)} commission
                  {discount ? `, ${discount}% ${pvCat.name} discount` : ''}, no agency).
                </div>
              ) : null}
              <div className="a-row wrap" style={{ gap: 6 }}>
                {draft[preview.type].map(t => (
                  <Badge key={t} tone={t <= cap ? 'success' : 'neutral'}>
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Hosts per category" subtitle={stats ? `${num(hostTotal)} active hosts` : 'Loading…'}>
            <BarList items={hostsPerCategory} format={num} />
          </Card>
        </div>
      </div>

      {dirty ? (
        <SaveBar
          count={changes.length}
          invalid={invalid}
          saving={saving}
          onDiscard={() => setDraft(toDraft(hostCategories, hostLevels, rateTiers))}
          onSave={save}
        />
      ) : null}

      {filling ? <FillModal open levels={levels} onClose={() => setFilling(false)} onApply={fill} /> : null}

      <Confirm
        open={removing}
        title={`Remove level ${top?.level}?`}
        message={
          hostsAtTop
            ? `${hostsAtTop} host${hostsAtTop === 1 ? ' is' : 's are'} at level ${top.level}. They’ll be treated as level ${top.level - 1} after you save, and prices above the new cap will be lowered.`
            : `No hosts are at level ${top?.level}. The change applies when you save.`
        }
        confirmLabel="Remove level"
        danger
        onClose={() => setRemoving(false)}
        onConfirm={() => {
          setDraft(d => ({ ...d, levels: d.levels.slice(0, -1) }))
          setRemoving(false)
        }}
      />
    </>
  )
}
