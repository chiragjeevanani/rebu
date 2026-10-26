import { useMemo, useState } from 'react'
import { AlertTriangle, Plus, Save, Trash2, Undo2, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Confirm, Field, Input, PageHeader, Seg, Select } from '../../components/ui'
import { BarList } from '../../components/charts'
import { inr, num, pct } from '../../utils/format'

const LEVEL_FIELDS = [
  { key: 'minutes', label: 'Minutes needed', unit: 'min' },
  { key: 'maxRate', label: 'Max price', unit: 'coins/min' },
  { key: 'commissionDiscount', label: 'Commission discount', unit: '%' },
]

const toDraft = (levels, tiers) => ({
  levels: levels.map(l => ({
    level: l.level,
    minutes: String(l.minutes),
    maxRate: String(l.maxRate),
    commissionDiscount: String(l.commissionDiscount),
  })),
  video: [...tiers.video],
  voice: [...tiers.voice],
})

const toNum = s => (String(s).trim() === '' ? NaN : Number(s))

function SaveBar({ count, invalid, onDiscard, onSave }) {
  return (
    <div
      className="a-row wrap"
      style={{
        position: 'sticky',
        bottom: 16,
        zIndex: 15,
        marginTop: 20,
        padding: '12px 16px',
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <span className="a-row" style={{ gap: 8, fontWeight: 700 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--warning)' }} />
        You have unsaved changes
        <span className="a-muted" style={{ fontWeight: 600 }}>
          · {count} change{count === 1 ? '' : 's'}
        </span>
      </span>
      {invalid ? <span className="a-danger a-small">Fix {invalid} error{invalid === 1 ? '' : 's'} to save</span> : null}
      <span className="a-spacer" />
      <Button icon={Undo2} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" icon={Save} disabled={!!invalid} onClick={onSave}>
        Save
      </Button>
    </div>
  )
}

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

export default function HostLevelsPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const { hostLevels, rateTiers, economy } = db.config
  const [draft, setDraft] = useState(() => toDraft(hostLevels, rateTiers))
  const [removing, setRemoving] = useState(false)
  const [preview, setPreview] = useState({ level: '2', type: 'video' })

  const levels = useMemo(
    () => draft.levels.map(l => ({ level: l.level, minutes: toNum(l.minutes), maxRate: toNum(l.maxRate), commissionDiscount: toNum(l.commissionDiscount) })),
    [draft.levels],
  )

  const errors = useMemo(() => {
    const out = {}
    const put = (i, k, m) => (out[`${i}.${k}`] = m)
    levels.forEach((l, i) => {
      const prev = levels[i - 1]
      if (!Number.isInteger(l.minutes) || l.minutes < 0) put(i, 'minutes', 'Whole minutes, 0 or more')
      else if (i === 0 && l.minutes !== 0) put(i, 'minutes', 'Level 1 must start at 0')
      else if (prev && Number.isFinite(prev.minutes) && l.minutes <= prev.minutes) put(i, 'minutes', `Must be more than level ${prev.level} (${num(prev.minutes)})`)
      if (!Number.isInteger(l.maxRate) || l.maxRate <= 0) put(i, 'maxRate', 'Whole coins, more than 0')
      else if (prev && Number.isFinite(prev.maxRate) && l.maxRate <= prev.maxRate) put(i, 'maxRate', `Must be more than level ${prev.level} (${prev.maxRate})`)
      if (!Number.isFinite(l.commissionDiscount) || l.commissionDiscount < 0 || l.commissionDiscount > 90) put(i, 'commissionDiscount', '0–90%')
    })
    if (!draft.video.length) out.video = 'Add at least one video price'
    if (!draft.voice.length) out.voice = 'Add at least one voice price'
    return out
  }, [levels, draft.video, draft.voice])

  // Every individual change, also used for the audit entry.
  const changes = useMemo(() => {
    const out = []
    levels.forEach(l => {
      const old = hostLevels.find(x => x.level === l.level)
      if (!old) return out.push(`added level ${l.level} (${num(l.minutes)} min, max ${l.maxRate} coins/min, ${l.commissionDiscount}% off)`)
      if (l.minutes !== old.minutes) out.push(`level ${l.level} minutes ${num(old.minutes)} → ${num(l.minutes)}`)
      if (l.maxRate !== old.maxRate) out.push(`level ${l.level} max price ${old.maxRate} → ${l.maxRate} coins/min`)
      if (l.commissionDiscount !== old.commissionDiscount) out.push(`level ${l.level} discount ${old.commissionDiscount}% → ${l.commissionDiscount}%`)
    })
    hostLevels.filter(o => !levels.some(l => l.level === o.level)).forEach(o => out.push(`removed level ${o.level}`))
    for (const kind of ['video', 'voice']) {
      const added = draft[kind].filter(t => !rateTiers[kind].includes(t))
      const removed = rateTiers[kind].filter(t => !draft[kind].includes(t))
      if (added.length || removed.length) {
        out.push(`${kind} prices ${[...added.map(t => `+${t}`), ...removed.map(t => `−${t}`)].join(' ')}`)
      }
    }
    return out
  }, [levels, hostLevels, draft, rateTiers])

  const dirty = changes.length > 0
  const invalid = Object.keys(errors).length

  const hostsPerLevel = useMemo(() => {
    const counts = {}
    for (const h of db.hosts) counts[h.level] = (counts[h.level] || 0) + 1
    const all = new Set([...levels.map(l => l.level), ...Object.keys(counts).map(Number)])
    return [...all].sort((a, b) => a - b).map(l => ({ label: `Level ${l}`, value: counts[l] || 0 }))
  }, [db.hosts, levels])

  const usage = useMemo(() => {
    const out = { video: {}, voice: {} }
    for (const h of db.hosts) {
      out.video[h.rates.video] = (out.video[h.rates.video] || 0) + 1
      out.voice[h.rates.voice] = (out.voice[h.rates.voice] || 0) + 1
    }
    return out
  }, [db.hosts])

  const setLevel = (i, k, v) => setDraft(d => ({ ...d, levels: d.levels.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }))

  const addLevel = () => {
    const top = levels[levels.length - 1]
    const nextTier = draft.video.find(t => t > (top?.maxRate || 0))
    setDraft(d => ({
      ...d,
      levels: [
        ...d.levels,
        {
          level: (top?.level || 0) + 1,
          minutes: String(top ? Math.max(top.minutes * 2, top.minutes + 1000) || 1000 : 0),
          maxRate: String(nextTier || (top?.maxRate || 0) + 100),
          commissionDiscount: String(top?.commissionDiscount || 0),
        },
      ],
    }))
  }

  const top = levels[levels.length - 1]
  const hostsAtTop = top ? db.hosts.filter(h => h.level === top.level).length : 0

  const save = () => {
    setConfig('hostLevels', levels.map(l => ({ ...l })), null)
    setConfig('rateTiers', { video: [...draft.video], voice: [...draft.voice] }, [`Updated host levels: ${changes.join(', ')}`, 'Host levels'])
    toast(`Host levels saved · ${changes.length} change${changes.length === 1 ? '' : 's'}`)
  }

  // ---- Preview
  const pv = levels.find(l => String(l.level) === preview.level) || levels[0]
  const cap = pv && Number.isFinite(pv.maxRate) ? pv.maxRate : 0
  const allowed = draft[preview.type].filter(t => t <= cap)
  const best = allowed.length ? allowed[allowed.length - 1] : null
  const rate = Math.max(0, economy.commission[preview.type] - (Number.isFinite(pv?.commissionDiscount) ? pv.commissionDiscount : 0))
  const netPerMin = best ? best * economy.coinInr * (1 - rate / 100) : 0

  return (
    <>
      <PageHeader
        title="Host levels & prices"
        subtitle="Hosts level up with total call minutes. Higher levels unlock higher per-minute prices and a lower commission."
        crumbs={[{ label: 'Monetization' }, { label: 'Host levels' }]}
      />

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <div className="a-stack">
          <Card
            padded={false}
            title="Levels"
            subtitle="Minutes and max price must go up with each level"
            actions={
              <span className="a-row" style={{ gap: 6 }}>
                <Button size="sm" icon={Trash2} disabled={levels.length <= 1} onClick={() => setRemoving(true)}>
                  Remove top level
                </Button>
                <Button size="sm" variant="primary" icon={Plus} onClick={addLevel}>
                  Add level
                </Button>
              </span>
            }
          >
            <div className="a-table-wrap">
              <table className="a-table">
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Level</th>
                    {LEVEL_FIELDS.map(f => (
                      <th key={f.key}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draft.levels.map((row, i) => {
                    const old = hostLevels.find(x => x.level === row.level)
                    const l = levels[i]
                    const offTier = Number.isFinite(l.maxRate) && !draft.video.includes(l.maxRate)
                    return (
                      <tr key={row.level}>
                        <td style={{ verticalAlign: 'top', paddingTop: 20 }}>
                          <span className="a-row" style={{ gap: 6 }}>
                            <b className="a-strong">Level {row.level}</b>
                            {!old ? <Badge tone="warning">New</Badge> : null}
                          </span>
                        </td>
                        {LEVEL_FIELDS.map(f => {
                          const edited = old && l[f.key] !== old[f.key]
                          const err = errors[`${i}.${f.key}`]
                          const warn = f.key === 'maxRate' && !err && offTier ? 'Not a video price tier' : null
                          return (
                            <td key={f.key} style={{ verticalAlign: 'top', minWidth: 150 }}>
                              <Field error={err} hint={warn ? <span className="a-warning">{warn}</span> : edited ? `Was ${num(old[f.key])}` : null}>
                                <Input
                                  type="number"
                                  min="0"
                                  affix={f.unit}
                                  value={row[f.key]}
                                  disabled={f.key === 'minutes' && i === 0}
                                  onChange={e => setLevel(i, f.key, e.target.value)}
                                  style={edited ? { borderColor: 'var(--warning)' } : undefined}
                                />
                              </Field>
                            </td>
                          )
                        })}
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
                <p style={{ fontSize: 15 }}>
                  A level-{pv.level} host can charge up to{' '}
                  <b className="a-strong">{best ? `${num(best)} coins/min` : 'nothing (no price fits the cap)'}</b> for {preview.type}.
                </p>
              ) : null}
              {best ? (
                <div className="a-small a-muted">
                  At that price they take home about <b className="a-strong">{inr(netPerMin)}</b> per minute ({pct(rate)} commission
                  {pv.commissionDiscount ? `, ${pv.commissionDiscount}% level discount` : ''}, no agency).
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

          <Card title="Hosts per level" subtitle={`${num(db.hosts.length)} hosts`}>
            <BarList items={hostsPerLevel} format={num} />
          </Card>
        </div>
      </div>

      {dirty ? (
        <SaveBar count={changes.length} invalid={invalid} onDiscard={() => setDraft(toDraft(hostLevels, rateTiers))} onSave={save} />
      ) : null}

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
