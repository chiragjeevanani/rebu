import { Save, Undo2 } from 'lucide-react'
import { Button } from './ui'

/** Sticky "unsaved changes" bar for draft-style config pages. */
export default function SaveBar({ count, noun = 'change', invalid, saving, onDiscard, onSave }) {
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
          · {count} {noun}
          {count === 1 ? '' : 's'}
        </span>
      </span>
      {invalid ? <span className="a-danger a-small">Fix {invalid} error{invalid === 1 ? '' : 's'} to save</span> : null}
      <span className="a-spacer" />
      <Button icon={Undo2} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" icon={Save} disabled={!!invalid || saving} onClick={onSave}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  )
}
