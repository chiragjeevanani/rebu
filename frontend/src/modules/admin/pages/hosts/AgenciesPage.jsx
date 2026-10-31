import { useEffect, useMemo, useState } from 'react'
import { Building2, Download, IndianRupee, Pencil, Plus, RotateCcw, ShieldOff, Trash2, Users } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { serverTable, useApi, usePaging } from '../../hooks/useApi'
import { api, errorText } from '../../api/client'
import {
  Badge,
  Button,
  Card,
  Confirm,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  SearchInput,
  Seg,
  Stat,
  Status,
  Who,
} from '../../components/ui'
import { date, exportCsv, inr, num } from '../../utils/format'

const STATUS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
]

const prefixOf = name =>
  (String(name).toUpperCase().replace(/[^A-Z]/g, '') + 'XXXX').slice(0, 4)

const randomDigits = () => String(1000 + Math.floor(Math.random() * 9000))

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

function AgencyForm({ open, agency, digits, codes, busy, onClose, onSave }) {
  const [f, setF] = useState(() => ({
    name: agency?.name || '',
    code: agency?.code || '',
    owner: agency?.owner || '',
    phone: agency?.phone || '',
    email: agency?.email || '',
    city: agency?.city || '',
    cut: String(agency?.cut ?? 10),
  }))
  // New agencies get a code that follows the name until the admin edits it.
  const [autoCode, setAutoCode] = useState(!agency)
  const [touched, setTouched] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const code = (autoCode ? (f.name.trim() ? prefixOf(f.name) + digits : '') : f.code).toUpperCase().trim()
  const cut = Number(f.cut)
  const errors = {
    name: !f.name.trim() ? 'Required' : null,
    code: !code
      ? 'Required'
      : !/^[A-Z0-9]{4,12}$/.test(code)
        ? '4–12 letters or digits'
        : codes.includes(code)
          ? 'Another agency already uses this code'
          : null,
    owner: !f.owner.trim() ? 'Required' : null,
    phone: !f.phone.trim() ? 'Required' : !/^[+\d][\d\s-]{7,}$/.test(f.phone.trim()) ? 'Enter a valid phone number' : null,
    email: f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim()) ? 'Enter a valid email' : null,
    city: !f.city.trim() ? 'Required' : null,
    cut: f.cut === '' || !Number.isFinite(cut) || cut < 0 || cut > 30 ? 'Between 0 and 30' : null,
  }
  const valid = Object.values(errors).every(e => !e)
  const err = k => (touched ? errors[k] : null)

  const submit = () => {
    setTouched(true)
    if (!valid) return
    onSave({
      name: f.name.trim(),
      code,
      owner: f.owner.trim(),
      phone: f.phone.trim(),
      email: f.email.trim(),
      city: f.city.trim(),
      cut: Math.round(cut * 10) / 10,
    })
  }

  return (
    <Modal
      open={open}
      title={agency ? `Edit ${agency.name}` : 'New agency'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || (touched && !valid)}>
            {agency ? 'Save changes' : 'Create agency'}
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <Field label="Agency name" error={err('name')}>
          <Input value={f.name} onChange={e => set('name', e.target.value)} autoFocus placeholder="e.g. Star Talent" />
        </Field>
        <Field
          label="Agency code"
          error={code && errors.code ? errors.code : err('code')}
          hint={autoCode ? 'Generated from the name. Hosts enter this when they apply.' : 'Hosts enter this when they apply.'}
        >
          <Input
            className="a-mono"
            value={code}
            onChange={e => {
              setAutoCode(false)
              set('code', e.target.value.toUpperCase().replace(/\s/g, ''))
            }}
            maxLength={12}
          />
        </Field>
        <div className="a-grid c2">
          <Field label="Owner" error={err('owner')}>
            <Input value={f.owner} onChange={e => set('owner', e.target.value)} />
          </Field>
          <Field label="Phone" error={err('phone')}>
            <Input value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
          </Field>
          <Field label="Email" error={err('email')}>
            <Input type="email" value={f.email} onChange={e => set('email', e.target.value)} />
          </Field>
          <Field label="City" error={err('city')}>
            <Input value={f.city} onChange={e => set('city', e.target.value)} />
          </Field>
        </div>
        <Field label="Agency cut" error={err('cut') || (f.cut !== '' && errors.cut)} hint="Share of each host’s net earnings paid to the agency (0–30%).">
          <Input type="number" min="0" max="30" step="0.5" affix="%" value={f.cut} onChange={e => set('cut', e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export default function AgenciesPage() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [form, setForm] = useState(null) // { agency|null, digits }
  const [confirm, setConfirm] = useState(null) // agency
  const [deleting, setDeleting] = useState(null) // agency
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const term = useDebounced(q.trim())

  const pg = usePaging({ q: term || undefined, status: status === 'all' ? undefined : status }, 20)
  const res = useApi('/admin/agencies', pg.query)
  const rows = res.data?.items

  // Every agency (there are few) for the header totals and code uniqueness.
  const allRes = useApi('/admin/agencies', { limit: 100 })
  const all = useMemo(() => allRes.data?.items || [], [allRes.data])
  const hostsTotal = useApi('/admin/hosts', { limit: 1 })
  const detail = useApi(openId ? `/admin/agencies/${openId}` : null)

  const totals = useMemo(
    () => ({
      count: allRes.data?.total ?? all.length,
      active: all.filter(a => a.status === 'active').length,
      hosts: all.reduce((n, a) => n + (a.hosts || 0), 0),
      month: all.reduce((n, a) => n + (a.monthEarnings || 0), 0),
    }),
    [all, allRes.data],
  )

  const open = openId ? detail.data?.agency || (rows || []).find(a => a.id === openId) || null : null
  const openHosts = detail.data?.hosts || []

  const reloadAll = () => {
    res.reload()
    allRes.reload()
    if (openId) detail.reload()
  }

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      toast(ok)
      reloadAll()
      setBusy(false)
      return true
    } catch (e) {
      toast(errorText(e), 'error')
      setBusy(false)
      return false
    }
  }

  const save = async data => {
    const ok = form.agency
      ? await run(() => api.patch(`/admin/agencies/${form.agency.id}`, data), 'Agency saved')
      : await run(() => api.post('/admin/agencies', data), `${data.name} created`)
    if (ok) setForm(null)
  }

  const setAgencyStatus = (a, next, reason) =>
    run(() => api.post(`/admin/agencies/${a.id}/status`, { status: next, reason: reason || undefined }), `${a.name} ${next === 'active' ? 'activated' : 'suspended'}`)

  const columns = [
    {
      key: 'name',
      label: 'Agency',
      serverSort: 'name',
      render: a => (
        <div>
          <b className="a-strong">{a.name}</b>
          <span className="a-small a-muted a-mono" style={{ display: 'block' }}>
            {a.code}
          </span>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'Owner',
      render: a => (
        <div>
          <span style={{ fontWeight: 600 }}>{a.owner || '—'}</span>
          <span className="a-small a-muted a-nowrap" style={{ display: 'block' }}>
            {a.phone}
            {a.email ? ` · ${a.email}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'city', label: 'City', render: a => a.city || '—' },
    { key: 'hosts', label: 'Hosts', align: 'right', render: a => num(a.hosts) },
    { key: 'cut', label: 'Cut', align: 'right', serverSort: 'cut', render: a => `${a.cut}%` },
    { key: 'monthEarnings', label: 'This month', align: 'right', render: a => <b className="a-strong">{inr(a.monthEarnings)}</b> },
    { key: 'status', label: 'Status', render: a => <Status value={a.status} /> },
    { key: 'created', label: 'Created', serverSort: 'created', render: a => <span className="a-nowrap">{date(a.created)}</span> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: a => (
        <span className="a-row" style={{ gap: 4, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" iconOnly icon={Pencil} aria-label="Edit" title="Edit" onClick={() => setForm({ agency: a })} />
          {a.status === 'active' ? (
            <Button size="sm" variant="ghost" iconOnly icon={ShieldOff} aria-label="Suspend" title="Suspend" onClick={() => setConfirm(a)} />
          ) : (
            <Button size="sm" variant="ghost" iconOnly icon={RotateCcw} aria-label="Activate" title="Activate" onClick={() => setConfirm(a)} />
          )}
        </span>
      ),
    },
  ]

  const codesExcept = id => all.filter(a => a.id !== id).map(a => a.code.toUpperCase())

  return (
    <>
      <PageHeader
        title="Agencies"
        subtitle="Talent agencies recruit and manage hosts and take a cut of their earnings."
        actions={
          <>
            <Button
              icon={Download}
              onClick={() =>
                exportCsv('rebu-agencies.csv', all, [
                  { label: 'ID', value: a => a.id },
                  { label: 'Name', value: a => a.name },
                  { label: 'Code', value: a => a.code },
                  { label: 'Owner', value: a => a.owner },
                  { label: 'Phone', value: a => a.phone },
                  { label: 'Email', value: a => a.email },
                  { label: 'City', value: a => a.city },
                  { label: 'Hosts', value: a => a.hosts },
                  { label: 'Cut (%)', value: a => a.cut },
                  { label: 'Month earnings (INR)', value: a => a.monthEarnings },
                  { label: 'Status', value: a => a.status },
                  { label: 'Created', value: a => date(a.created) },
                ])
              }
            >
              Export CSV
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setForm({ agency: null, digits: randomDigits() })}>
              New agency
            </Button>
          </>
        }
      />

      <div className="a-grid c3" style={{ marginBottom: 20 }}>
        <Stat label="Agencies" value={num(totals.count)} icon={Building2} sub={`${totals.active} active`} />
        <Stat label="Hosts in agencies" value={num(totals.hosts)} icon={Users} sub={hostsTotal.data ? `of ${num(hostsTotal.data.total)} hosts` : 'approved hosts'} />
        <Stat label="Agency share this month" value={inr(totals.month)} icon={IndianRupee} sub="paid to agencies" />
      </div>

      <Card padded={false}>
        <DataTable
          rows={rows}
          columns={columns}
          {...serverTable(pg, res)}
          onRowClick={a => setOpenId(a.id)}
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Name, code, owner, city" />
              <Seg options={STATUS} value={status} onChange={setStatus} />
            </>
          }
          empty={
            totals.count ? (
              <Empty title="No results" text="Try a different search or filter." />
            ) : (
              <Empty icon={Building2} title="No agencies yet" text="Create one to give hosts an agency code." />
            )
          }
        />
      </Card>

      <Drawer
        open={!!open}
        title={open?.name}
        onClose={() => setOpenId(null)}
        footer={
          open ? (
            <>
              <Button icon={Pencil} onClick={() => setForm({ agency: open })}>
                Edit
              </Button>
              {open.status === 'active' ? (
                <Button variant="soft-danger" icon={ShieldOff} onClick={() => setConfirm(open)}>
                  Suspend
                </Button>
              ) : (
                <Button variant="primary" icon={RotateCcw} onClick={() => setConfirm(open)}>
                  Activate
                </Button>
              )}
              {!open.hosts ? (
                <Button variant="ghost" icon={Trash2} onClick={() => setDeleting(open)}>
                  Delete
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {open ? (
          <div className="a-stack">
            <dl className="a-dl" style={{ gridTemplateColumns: '120px 1fr' }}>
              <dt>Code</dt>
              <dd className="a-mono">{open.code}</dd>
              <dt>Status</dt>
              <dd>
                <Status value={open.status} />
              </dd>
              <dt>Owner</dt>
              <dd>{open.owner || '—'}</dd>
              <dt>Phone</dt>
              <dd>{open.phone || '—'}</dd>
              <dt>Email</dt>
              <dd>{open.email || '—'}</dd>
              <dt>City</dt>
              <dd>{open.city || '—'}</dd>
              <dt>Cut</dt>
              <dd>{open.cut}%</dd>
              <dt>This month</dt>
              <dd>{inr(open.monthEarnings)}</dd>
              <dt>Created</dt>
              <dd>{date(open.created)}</dd>
            </dl>
            <div className="a-divider" style={{ margin: 0 }} />
            <div className="a-row between">
              <b className="a-strong">Hosts</b>
              <Badge>{openHosts.length}</Badge>
            </div>
            {detail.error ? (
              <ErrorState error={detail.error} onRetry={detail.reload} />
            ) : !detail.data ? (
              <Loading />
            ) : openHosts.length ? (
              <div className="a-stack" style={{ gap: 12 }}>
                {openHosts.map(h => (
                  <div key={h.id} className="a-row between">
                    <Who src={h.avatar} name={h.name} sub={`${h.id} · Lv ${h.level}`} to={`/admin/hosts/${h.id}`} />
                    <span className="a-row" style={{ gap: 10 }}>
                      <b className="a-strong" title="Lifetime earnings">{inr(h.lifetime || 0)}</b>
                      <Status value={h.status === 'active' ? (h.online ? 'online' : 'offline') : h.status} />
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty icon={Users} title="No hosts yet" text={`Hosts join by entering code ${open.code} when they apply.`} />
            )}
          </div>
        ) : null}
      </Drawer>

      {form ? (
        <AgencyForm
          open
          agency={form.agency}
          digits={form.digits || '0000'}
          codes={codesExcept(form.agency?.id)}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={save}
        />
      ) : null}

      <Confirm
        open={!!confirm && confirm.status === 'active'}
        title={`Suspend ${confirm?.name}?`}
        message="New applicants can’t use this agency’s code. Existing hosts stay with the agency, but the agency share is held until it’s reactivated."
        confirmLabel="Suspend agency"
        danger
        reason
        onClose={() => setConfirm(null)}
        onConfirm={async reason => {
          if (await setAgencyStatus(confirm, 'suspended', reason)) setConfirm(null)
        }}
      />
      <Confirm
        open={!!confirm && confirm.status !== 'active'}
        title={`Activate ${confirm?.name}?`}
        message="The agency code works again for new applicants and the agency share resumes."
        confirmLabel="Activate"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (await setAgencyStatus(confirm, 'active')) setConfirm(null)
        }}
      />
      <Confirm
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        message="The agency and its code are removed for good. Only agencies with no hosts can be deleted."
        confirmLabel="Delete agency"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const a = deleting
          if (await run(() => api.del(`/admin/agencies/${a.id}`), `${a.name} deleted`)) {
            setDeleting(null)
            setOpenId(null)
          }
        }}
      />
    </>
  )
}
