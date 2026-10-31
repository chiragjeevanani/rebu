import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { errorText } from '../../api/client'
import { Badge, Button, Card, Field, Input, PageHeader } from '../../components/ui'
import SaveBar from '../../components/SaveBar'
import { ColorInput } from '../../components/LevelChips'
import { isHex, slugKey } from '../../utils/levels'
import { num } from '../../utils/format'

const toDraft = tiers => tiers.map(t => ({ key: t.key, name: t.name, minCoins: String(t.minCoins), color: t.color || '' }))
const toNum = s => (String(s).trim() === '' ? NaN : Number(s))

/** A round avatar placeholder wearing the frame colour, as the app shows it. */
function FrameSample({ color, size = 44 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'inline-block',
        background: 'var(--surface-3)',
        border: color ? `3px solid ${color}` : '1px dashed var(--border-strong)',
        boxShadow: color ? '0 0 0 2px var(--surface) inset' : undefined,
      }}
    />
  )
}

export default function SenderFramesPage() {
  const { db, setConfig } = useStore()
  const toast = useToast()
  const saved = db.config.senderTiers
  const [draft, setDraft] = useState(() => toDraft(saved))
  const [saving, setSaving] = useState(false)

  const tiers = useMemo(
    () => draft.map(t => ({ key: t.key.trim(), name: t.name.trim(), minCoins: toNum(t.minCoins), color: t.color.trim().toUpperCase() })),
    [draft],
  )

  const errors = useMemo(() => {
    const out = {}
    tiers.forEach((t, i) => {
      const prev = tiers[i - 1]
      if (!t.name) out[`${i}.name`] = 'Required'
      if (!/^[a-z0-9_-]{1,24}$/.test(t.key)) out[`${i}.name`] = out[`${i}.name`] || 'Name needs a letter or number'
      else if (tiers.findIndex(x => x.key === t.key) !== i) out[`${i}.name`] = 'Another frame already uses this key'
      if (t.color && !isHex(t.color)) out[`${i}.color`] = 'Use #RRGGBB, or leave empty for no frame'
      if (!Number.isInteger(t.minCoins) || t.minCoins < 0) out[`${i}.minCoins`] = 'Whole coins, 0 or more'
      else if (i === 0 && t.minCoins !== 0) out[`${i}.minCoins`] = 'The first tier starts at 0'
      else if (prev && Number.isFinite(prev.minCoins) && t.minCoins <= prev.minCoins) out[`${i}.minCoins`] = `More than ${prev.name || 'the previous tier'} (${num(prev.minCoins)})`
    })
    return out
  }, [tiers])

  const changes = useMemo(() => {
    const out = []
    tiers.forEach(t => {
      const old = saved.find(x => x.key === t.key)
      if (!old) return out.push(`added ${t.name || t.key}`)
      if (t.name !== old.name) out.push(`${old.name} renamed to ${t.name}`)
      if (t.minCoins !== old.minCoins) out.push(`${t.name} ${num(old.minCoins)} → ${num(t.minCoins)} coins`)
      if (t.color !== (old.color || '').toUpperCase()) out.push(`${t.name} colour`)
    })
    saved.filter(o => !tiers.some(t => t.key === o.key)).forEach(o => out.push(`removed ${o.name}`))
    return out
  }, [tiers, saved])

  const invalid = Object.keys(errors).length
  const set = (i, k, v) => setDraft(d => d.map((t, j) => (j === i ? { ...t, [k]: v, ...(k === 'name' && t.isNew ? { key: slugKey(v) } : null) } : t)))
  const add = () => {
    const last = tiers[tiers.length - 1]
    setDraft(d => [...d, { isNew: true, key: '', name: '', minCoins: String(Number.isFinite(last?.minCoins) ? Math.max(1000, last.minCoins * 2) : 1000), color: '#6C4DE6' }])
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = await setConfig('senderTiers', tiers)
      setDraft(toDraft(next))
      toast(`Sender frames saved · ${changes.length} change${changes.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Sender frames"
        subtitle="Users earn an avatar frame from the total coins they have ever bought. The highest tier they reach is shown around their photo in the app."
        crumbs={[{ label: 'Monetization' }, { label: 'Sender frames' }]}
      />

      <div className="a-grid side" style={{ alignItems: 'start' }}>
        <Card
          padded={false}
          title="Frame tiers"
          subtitle="Coin thresholds must go up with every tier"
          actions={
            <Button size="sm" variant="primary" icon={Plus} disabled={draft.length >= 20} onClick={add}>
              Add tier
            </Button>
          }
        >
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Frame</th>
                  <th>Name</th>
                  <th>Coins bought from</th>
                  <th>Colour</th>
                  <th style={{ width: 44 }} />
                </tr>
              </thead>
              <tbody>
                {draft.map((row, i) => {
                  const t = tiers[i]
                  const old = row.isNew ? null : saved.find(x => x.key === row.key)
                  const editedCoins = old && t.minCoins !== old.minCoins
                  return (
                    <tr key={i}>
                      <td style={{ verticalAlign: 'top', paddingTop: 14 }}>
                        <FrameSample color={isHex(t.color) ? t.color : ''} />
                      </td>
                      <td style={{ verticalAlign: 'top', minWidth: 180 }}>
                        <Field error={errors[`${i}.name`]} hint={<span className="a-mono">{t.key || 'key'}</span>}>
                          <span className="a-row" style={{ gap: 6 }}>
                            <Input value={row.name} maxLength={30} placeholder="e.g. Gold" onChange={e => set(i, 'name', e.target.value)} />
                            {!old ? <Badge tone="warning">New</Badge> : null}
                          </span>
                        </Field>
                      </td>
                      <td style={{ verticalAlign: 'top', minWidth: 170 }}>
                        <Field error={errors[`${i}.minCoins`]} hint={editedCoins ? `Was ${num(old.minCoins)}` : null}>
                          <Input
                            type="number"
                            min="0"
                            affix="coins"
                            value={row.minCoins}
                            disabled={i === 0}
                            onChange={e => set(i, 'minCoins', e.target.value)}
                            style={editedCoins ? { borderColor: 'var(--warning)' } : undefined}
                          />
                        </Field>
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <Field error={errors[`${i}.color`]} hint={!t.color ? 'No frame' : null}>
                          <ColorInput allowNone value={row.color} invalid={!!errors[`${i}.color`]} onChange={v => set(i, 'color', v)} />
                        </Field>
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          icon={Trash2}
                          disabled={i === 0}
                          title={i === 0 ? 'The first tier can’t be removed' : undefined}
                          onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                          aria-label={`Remove ${t.name || 'tier'}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="a-stack">
          <Card title="How it works">
            <div className="a-stack a-small a-muted" style={{ gap: 8 }}>
              <span>Every coin pack a user buys, including its bonus coins, adds to their lifetime “coins bought”. Signup gifts and rewards don’t count.</span>
              <span>Spending coins doesn’t lower a user’s frame. Changing a threshold here moves users to the matching tier right away.</span>
              <span>Leave the colour empty for a tier that shows no frame (usually the first one).</span>
            </div>
          </Card>
          <Card title="Preview" subtitle={changes.length ? 'Using your unsaved values' : 'Using saved values'}>
            <div className="a-stack" style={{ gap: 10 }}>
              {tiers.map((t, i) => (
                <div key={i} className="a-row">
                  <FrameSample color={isHex(t.color) ? t.color : ''} size={36} />
                  <b className="a-strong" style={{ flex: 1 }}>
                    {t.name || '—'}
                  </b>
                  <span className="a-muted a-small">{Number.isFinite(t.minCoins) ? `${num(t.minCoins)}+ coins` : '—'}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {changes.length ? (
        <SaveBar count={changes.length} invalid={invalid} saving={saving} onDiscard={() => setDraft(toDraft(saved))} onSave={save} />
      ) : null}
    </>
  )
}
