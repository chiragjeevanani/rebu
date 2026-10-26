import { Fragment, useState } from 'react'
import { Eye, FileText, PenLine, Plus, RotateCcw, Save } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useApi } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import { useToast } from '../../hooks/useToast'
import { Button, Card, Empty, ErrorState, Field, Input, Loading, Modal, PageHeader, Seg, Textarea } from '../../components/ui'
import { ago, dateTime } from '../../utils/format'

const BULLET = /^\s*[•\-*]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

/** Renders plain-text page bodies the way the app does: paragraphs, bullet and numbered lists. */
function Rendered({ body }) {
  const blocks = body.split(/\n\s*\n/).map(b => b.split('\n').filter(l => l.trim()))
  return (
    <div style={{ lineHeight: 1.6, fontSize: 14.5 }}>
      {blocks.map((lines, i) => {
        // Group consecutive lines of the same kind inside a block.
        const groups = []
        for (const line of lines) {
          const kind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : line.startsWith('# ') ? 'h' : 'p'
          const last = groups[groups.length - 1]
          if (last && last.kind === kind && kind !== 'h') last.lines.push(line)
          else groups.push({ kind, lines: [line] })
        }
        return (
          <Fragment key={i}>
            {groups.map((g, j) => {
              const key = `${i}-${j}`
              if (g.kind === 'h') return <h3 key={key} style={{ margin: '14px 0 6px', fontSize: 16 }}>{g.lines[0].slice(2)}</h3>
              if (g.kind === 'ul' || g.kind === 'ol') {
                const List = g.kind
                return (
                  <List key={key} style={{ margin: '0 0 12px', paddingLeft: 22 }}>
                    {g.lines.map((l, k) => (
                      <li key={k} style={{ marginBottom: 4 }}>{l.replace(g.kind === 'ul' ? BULLET : NUMBERED, '')}</li>
                    ))}
                  </List>
                )
              }
              return (
                <p key={key} style={{ margin: '0 0 12px' }}>
                  {g.lines.map((l, k) => (
                    <Fragment key={k}>
                      {k ? <br /> : null}
                      {/* A question line (FAQ style) reads as a heading. */}
                      {l.trim().endsWith('?') && g.lines.length > 1 && k === 0 ? <b className="a-strong">{l}</b> : l}
                    </Fragment>
                  ))}
                </p>
              )
            })}
          </Fragment>
        )
      })}
    </div>
  )
}

const slugify = t =>
  t
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

function NewPage({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [touched, setTouched] = useState(false)
  const s = touched ? slug : slugify(title)
  const bad = s && !/^[a-z0-9-]{2,60}$/.test(s)
  return (
    <Modal
      open
      title="New page"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!title.trim() || !s || bad} onClick={() => onCreate({ title: title.trim(), slug: s })}>
            Create page
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Title">
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Community guidelines" autoFocus />
        </Field>
        <Field label="Slug" hint={`Opens in the app as rebu://page/${s || 'slug'}`} error={bad ? 'Use lowercase letters, digits and dashes' : null}>
          <Input
            className="a-mono"
            value={s}
            onChange={e => {
              setTouched(true)
              setSlug(e.target.value)
            }}
          />
        </Field>
      </div>
    </Modal>
  )
}

export default function PagesPage() {
  const { db } = useStore()
  const toast = useToast()
  const res = useApi('/admin/content/pages')
  const pages = res.data?.items || []
  const [selectedId, setSelectedId] = useState(null)
  const [drafts, setDrafts] = useState({}) // pageId → { title, body } with unsaved edits
  const [mode, setMode] = useState('edit')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const page = pages.find(p => p.id === selectedId) || pages[0]
  const draft = page ? drafts[page.id] || { title: page.title, body: page.body } : null
  const dirty = !!page && (draft.title !== page.title || draft.body !== page.body)
  const isDirty = p => !!drafts[p.id] && (drafts[p.id].title !== p.title || drafts[p.id].body !== p.body)

  const edit = patch => setDrafts(d => ({ ...d, [page.id]: { ...draft, ...patch } }))
  const discard = () =>
    setDrafts(d => {
      const next = { ...d }
      delete next[page.id]
      return next
    })

  const save = async () => {
    setBusy(true)
    try {
      const { page: saved } = await api.patch(`/admin/content/pages/${page.id}`, { title: draft.title.trim(), body: draft.body })
      res.setData(d => ({ ...d, items: d.items.map(p => (p.id === saved.id ? saved : p)) }))
      discard()
      toast('Page published to the app')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  const create = async body => {
    try {
      const { page: p } = await api.post('/admin/content/pages', body)
      res.setData(d => ({ ...d, items: [...d.items, p].sort((x, y) => x.title.localeCompare(y.title)), total: d.total + 1 }))
      setSelectedId(p.id)
      setCreating(false)
      setMode('edit')
      toast('Page created')
    } catch (e) {
      toast(errorText(e), 'error')
    }
  }

  // The server starts empty; offer the standard REBU pages (texts from the old demo data).
  const addStandard = async () => {
    setBusy(true)
    try {
      for (const p of db.pages) await api.post('/admin/content/pages', { slug: p.slug, title: p.title, body: p.body })
      toast('Standard pages added')
    } catch (e) {
      toast(errorText(e), 'error')
    } finally {
      setBusy(false)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Pages & policies"
        subtitle="Terms, privacy, rules and help pages shown inside the app. Changes go live as soon as you save."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New page
          </Button>
        }
      />

      {res.error && !res.data ? (
        <Card>
          <ErrorState error={res.error} onRetry={res.reload} />
        </Card>
      ) : !res.data ? (
        <Card>
          <Loading />
        </Card>
      ) : !page ? (
        <Card>
          <Empty icon={FileText} title="No pages" text="Create a page, or add the standard terms, privacy, rules and help pages." />
          <div className="a-row" style={{ justifyContent: 'center', paddingBottom: 18 }}>
            <Button disabled={busy} onClick={addStandard}>
              Add standard pages
            </Button>
          </div>
        </Card>
      ) : (
        <div className="a-grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card padded={false}>
            {pages.map(p => {
              const on = p.id === page.id
              return (
                <button
                  key={p.id}
                  type="button"
                  className="a-list-row"
                  onClick={() => setSelectedId(p.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderBottom: '1px solid var(--border)',
                    background: on ? 'var(--brand-soft)' : 'transparent',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                  }}
                >
                  <FileText size={17} color={on ? 'var(--brand)' : 'var(--muted)'} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b className="a-strong" style={{ display: 'block' }}>
                      {p.title}
                      {isDirty(p) ? <span className="a-warning" title="Unsaved changes"> •</span> : null}
                    </b>
                    <span className="a-small a-muted">
                      <span className="a-mono">/{p.slug}</span> · {ago(p.updated)}
                    </span>
                  </span>
                </button>
              )
            })}
          </Card>

          <Card
            title={draft.title || 'Untitled'}
            subtitle={
              <>
                <span className="a-mono">rebu://page/{page.slug}</span> · Last updated {dateTime(page.updated)}{page.updatedBy ? ` by ${page.updatedBy}` : ''}
              </>
            }
            actions={
              <Seg
                options={[
                  { value: 'edit', label: 'Edit' },
                  { value: 'preview', label: 'Preview' },
                ]}
                value={mode}
                onChange={setMode}
              />
            }
            footer={
              <div className="a-row">
                <span className="a-small a-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
                <span className="a-spacer" />
                <Button variant="ghost" icon={RotateCcw} disabled={!dirty} onClick={discard}>
                  Discard
                </Button>
                <Button variant="primary" icon={Save} disabled={busy || !dirty || !draft.title.trim() || !draft.body.trim()} onClick={save}>
                  Save
                </Button>
              </div>
            }
          >
            {mode === 'edit' ? (
              <div className="a-stack">
                <Field label="Title">
                  <Input value={draft.title} onChange={e => edit({ title: e.target.value })} />
                </Field>
                <Field label="Content" hint="Plain text. Blank line = new paragraph. Start a line with • or - for bullets, 1. for numbered steps, # for a heading.">
                  <Textarea
                    value={draft.body}
                    onChange={e => edit({ body: e.target.value })}
                    spellCheck
                    style={{ minHeight: 380, fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace", fontSize: 13, lineHeight: 1.6 }}
                  />
                </Field>
              </div>
            ) : (
              <div style={{ maxWidth: 420, margin: '0 auto', padding: 20, border: '1px solid var(--border)', borderRadius: 18 }}>
                <div className="a-row a-small a-muted" style={{ marginBottom: 12 }}>
                  <Eye size={14} /> As shown in the app
                </div>
                <h2 style={{ fontSize: 20, marginBottom: 12 }}>{draft.title}</h2>
                {draft.body.trim() ? <Rendered body={draft.body} /> : <Empty icon={PenLine} title="Nothing written yet" />}
              </div>
            )}
          </Card>
        </div>
      )}

      {creating ? <NewPage onClose={() => setCreating(false)} onCreate={create} /> : null}
    </>
  )
}
