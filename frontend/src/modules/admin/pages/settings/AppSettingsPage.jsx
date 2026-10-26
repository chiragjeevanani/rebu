import { useState } from 'react'
import { AlertTriangle, Plus, RotateCcw, Save, X } from 'lucide-react'
import { useStore } from '../../hooks/useStore'
import { useToast } from '../../hooks/useToast'
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Setting, Switch, Tabs, Textarea } from '../../components/ui'

const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const VERSION = /^\d+\.\d+\.\d+$/
const cmpVersion = (a, b) => {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

// Each tab owns these top-level keys of config.settings.
const TABS = [
  { value: 'general', label: 'General', keys: ['maintenance', 'maintenanceMessage', 'minVersion', 'latestVersion', 'forceUpdate', 'support'] },
  { value: 'login', label: 'Login & OTP', keys: ['login', 'otp'] },
  { value: 'features', label: 'Features', keys: ['features'] },
  { value: 'hosts', label: 'Hosts', keys: ['hostApply', 'limits'] },
  { value: 'moderation', label: 'Moderation', keys: ['moderation'] },
]

const LOGIN_METHODS = [
  ['phone', 'Phone number + OTP', 'The default sign-in. Most users in India use this.'],
  ['google', 'Google', 'One-tap sign-in with a Google account.'],
  ['apple', 'Apple', 'Sign in with Apple. Required by the App Store when other social logins are offered on iOS.'],
  ['facebook', 'Facebook', 'Sign in with a Facebook account.'],
  ['email', 'Email', 'Email and password, mainly for users without a phone number.'],
]

const FEATURES = [
  ['randomCall', 'Random call', 'The “Random call” button that matches users with an available host.'],
  ['goLive', 'Go live', 'The Go Live option on the camera button. Hosts can’t start new live streams.'],
  ['premiumLive', 'Premium (ticketed) lives', 'Hosts can charge an entry ticket in coins for a live.'],
  ['rooms', 'Party & audio rooms', 'Multi-seat party rooms and audio rooms in Explore.'],
  ['moments', 'Moments', 'The Moments feed: posting, liking and commenting.'],
  ['gifts', 'Gifts', 'Sending gifts in calls, lives, rooms and chats.'],
  ['chat', 'Paid chat', 'Paid text messages to hosts. Chats become read-only when off.'],
  ['screenshotBlock', 'Screenshot & recording block', 'Blocks screenshots and screen recording on chats, calls and lives.'],
  ['hostApplications', 'Host applications', 'The “Become a host” entry. New people can’t apply while off.'],
  ['agencies', 'Agencies', 'Agency codes during host sign-up and agency earnings share.'],
]

/** Number field that keeps the draft numeric. */
function NumInput({ value, onChange, min = 0, max, affix, step = 1 }) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      affix={affix}
      value={value}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      style={{ width: 160 }}
    />
  )
}

/** Add/remove a list of short strings. */
function ChipEditor({ values, onChange, placeholder, lower }) {
  const [text, setText] = useState('')
  const add = () => {
    const v = (lower ? text.toLowerCase() : text).trim()
    if (!v) return
    if (!values.some(x => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setText('')
  }
  return (
    <div className="a-stack" style={{ gap: 10 }}>
      <div className="a-row wrap" style={{ gap: 6 }}>
        {values.length === 0 ? <span className="a-small a-faint">None yet</span> : null}
        {values.map(v => (
          <span
            key={v}
            className="a-badge neutral"
            style={{ paddingRight: 4, gap: 4, display: 'inline-flex', alignItems: 'center' }}
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter(x => x !== v))}
              aria-label={`Remove ${v}`}
              style={{ display: 'grid', placeItems: 'center', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 2 }}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="a-row">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <Button icon={Plus} onClick={add} disabled={!text.trim()}>
          Add
        </Button>
      </div>
    </div>
  )
}

function SaveBar({ dirty, error, onDiscard, onSave }) {
  return (
    <div
      className="a-card a-row"
      style={{ position: 'sticky', bottom: 16, padding: '12px 16px', marginTop: 16, zIndex: 2, boxShadow: dirty ? 'var(--shadow-lg)' : undefined }}
    >
      <span className={`a-small ${error ? 'a-danger' : 'a-muted'}`}>{error || (dirty ? 'You have unsaved changes' : 'All changes saved')}</span>
      <span className="a-spacer" />
      <Button variant="ghost" icon={RotateCcw} disabled={!dirty} onClick={onDiscard}>
        Discard
      </Button>
      <Button variant="primary" icon={Save} disabled={!dirty || !!error} onClick={onSave}>
        Save changes
      </Button>
    </div>
  )
}

function Warn({ tone = 'warning', children }) {
  return (
    <div
      className="a-row"
      style={{
        alignItems: 'flex-start',
        padding: '12px 14px',
        borderRadius: 'var(--radius-sm)',
        background: `var(--${tone}-soft)`,
        color: `var(--${tone})`,
        fontWeight: 600,
      }}
    >
      <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  )
}

/* ---------- Tabs ---------- */

function GeneralTab({ d, set }) {
  const ver = (key, os, v) => set({ [key]: { ...d[key], [os]: v } })
  return (
    <div className="a-stack">
      {d.maintenance ? (
        <Warn tone="danger">Maintenance mode is ON. Once saved, users and hosts see the message below and can’t use the app.</Warn>
      ) : null}
      <Card title="Maintenance">
        <Setting title="Maintenance mode" description="Shows a full-screen message in the app and blocks calls, lives and payments.">
          <Switch checked={d.maintenance} onChange={v => set({ maintenance: v })} />
        </Setting>
        <Field label="Message shown in the app" style={{ marginTop: 10 }}>
          <Textarea value={d.maintenanceMessage} maxLength={200} onChange={e => set({ maintenanceMessage: e.target.value })} />
        </Field>
      </Card>
      <Card title="App versions" subtitle="Versions below the minimum must update before they can sign in.">
        <div className="a-grid c2">
          {['android', 'ios'].map(os => (
            <div key={os} className="a-stack" style={{ gap: 12 }}>
              <b className="a-strong">{os === 'ios' ? 'iOS' : 'Android'}</b>
              <Field label="Minimum supported" error={!VERSION.test(d.minVersion[os]) ? 'Use the form 1.2.0' : null}>
                <Input className="a-mono" value={d.minVersion[os]} onChange={e => ver('minVersion', os, e.target.value.trim())} />
              </Field>
              <Field label="Latest" error={!VERSION.test(d.latestVersion[os]) ? 'Use the form 1.3.0' : null}>
                <Input className="a-mono" value={d.latestVersion[os]} onChange={e => ver('latestVersion', os, e.target.value.trim())} />
              </Field>
            </div>
          ))}
        </div>
        <div className="a-divider" />
        <Setting title="Force update" description="Users on any version older than the latest are asked to update and can’t skip.">
          <Switch checked={d.forceUpdate} onChange={v => set({ forceUpdate: v })} />
        </Setting>
      </Card>
      <Card title="Support contact" subtitle="Shown on Help & support in the app.">
        <div className="a-grid c2">
          <Field label="Support email">
            <Input type="email" value={d.support.email} onChange={e => set({ support: { ...d.support, email: e.target.value } })} />
          </Field>
          <Field label="Support hours">
            <Input value={d.support.hours} onChange={e => set({ support: { ...d.support, hours: e.target.value } })} />
          </Field>
        </div>
      </Card>
    </div>
  )
}

const generalError = d => {
  for (const os of ['android', 'ios']) {
    if (!VERSION.test(d.minVersion[os]) || !VERSION.test(d.latestVersion[os])) return 'Versions must look like 1.2.0'
    if (cmpVersion(d.minVersion[os], d.latestVersion[os]) > 0) return `${os === 'ios' ? 'iOS' : 'Android'}: minimum version is higher than latest`
  }
  if (d.maintenance && !d.maintenanceMessage.trim()) return 'Add a maintenance message'
  if (!/^\S+@\S+\.\S+$/.test(d.support.email)) return 'Enter a valid support email'
  return null
}

function LoginTab({ d, set }) {
  const on = Object.values(d.login).filter(Boolean).length
  const otp = patch => set({ otp: { ...d.otp, ...patch } })
  return (
    <div className="a-stack">
      <Card title="Login methods" subtitle="At least one method must stay on.">
        {LOGIN_METHODS.map(([key, title, desc]) => (
          <Setting key={key} title={title} description={desc}>
            <Switch
              checked={d.login[key]}
              disabled={d.login[key] && on === 1}
              onChange={v => set({ login: { ...d.login, [key]: v } })}
            />
          </Setting>
        ))}
      </Card>
      <Card title="OTP" subtitle="Used for phone sign-in and when changing a phone number.">
        <div className="a-grid c2">
          <Field label="SMS provider">
            <Select value={d.otp.provider} onChange={e => otp({ provider: e.target.value })} options={['MSG91', 'Twilio', 'Firebase']} />
          </Field>
          <Field label="Code length">
            <Select
              value={String(d.otp.length)}
              onChange={e => otp({ length: Number(e.target.value) })}
              options={[
                { value: '4', label: '4 digits' },
                { value: '6', label: '6 digits' },
              ]}
            />
          </Field>
          <Field label="Code expires after" hint="60 – 900 seconds">
            <NumInput value={d.otp.expirySecs} min={60} max={900} affix="sec" onChange={v => otp({ expirySecs: v })} />
          </Field>
          <Field label="Resend allowed after" hint="15 – 120 seconds">
            <NumInput value={d.otp.resendSecs} min={15} max={120} affix="sec" onChange={v => otp({ resendSecs: v })} />
          </Field>
        </div>
      </Card>
      <Card title="Test login" subtitle="For app store reviewers and QA. This number always accepts the test OTP without sending an SMS.">
        <div className="a-stack">
          <Warn>Remove the test number before launch. Anyone who knows it can sign in.</Warn>
          <div className="a-grid c2">
            <Field label="Test phone number" hint="Leave empty to turn off">
              <Input className="a-mono" value={d.otp.testNumber} inputMode="numeric" onChange={e => otp({ testNumber: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
            </Field>
            <Field label="Test OTP" error={d.otp.testNumber && d.otp.testOtp.length !== d.otp.length ? `Must be ${d.otp.length} digits` : null}>
              <Input className="a-mono" value={d.otp.testOtp} inputMode="numeric" onChange={e => otp({ testOtp: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
            </Field>
          </div>
        </div>
      </Card>
    </div>
  )
}

const loginError = d => {
  if (!Object.values(d.login).some(Boolean)) return 'Keep at least one login method on'
  const { expirySecs, resendSecs, testNumber, testOtp, length } = d.otp
  if (!(expirySecs >= 60 && expirySecs <= 900)) return 'OTP expiry must be 60–900 seconds'
  if (!(resendSecs >= 15 && resendSecs <= 120)) return 'Resend wait must be 15–120 seconds'
  if (resendSecs >= expirySecs) return 'Resend wait must be shorter than the expiry'
  if (testNumber && testNumber.length !== 10) return 'Test number must be 10 digits'
  if (testNumber && testOtp.length !== length) return `Test OTP must be ${length} digits`
  return null
}

function FeaturesTab({ d, set }) {
  const off = FEATURES.filter(([k]) => !d.features[k]).length
  return (
    <Card title="Feature switches" subtitle="Turning a feature off hides it in the app within a minute. No app update needed." actions={off ? <Badge tone="warning">{off} off</Badge> : <Badge tone="success">All on</Badge>}>
      {FEATURES.map(([key, title, desc]) => (
        <Setting key={key} title={title} description={desc}>
          <Switch checked={d.features[key]} onChange={v => set({ features: { ...d.features, [key]: v } })} />
        </Setting>
      ))}
    </Card>
  )
}

function HostsTab({ d, set }) {
  const ha = patch => set({ hostApply: { ...d.hostApply, ...patch } })
  const lim = patch => set({ limits: { ...d.limits, ...patch } })
  return (
    <div className="a-stack">
      <Card title="Host applications">
        <Setting title="Minimum age" description="Applicants younger than this are rejected. Checked against the ID.">
          <NumInput value={d.hostApply.minAge} min={18} max={30} affix="yrs" onChange={v => ha({ minAge: v })} />
        </Setting>
        <Setting title="Require selfie" description="Applicants take a live selfie that is matched against their photos.">
          <Switch checked={d.hostApply.requireSelfie} onChange={v => ha({ requireSelfie: v })} />
        </Setting>
        <Setting title="Require government ID" description="Applicants upload one of the accepted IDs below.">
          <Switch checked={d.hostApply.requireId} onChange={v => ha({ requireId: v })} />
        </Setting>
        <Setting title="Auto-approve" description="Approve applications without a moderator review.">
          <Switch checked={d.hostApply.autoApprove} onChange={v => ha({ autoApprove: v })} />
        </Setting>
        {d.hostApply.autoApprove ? (
          <Warn tone="danger">Auto-approve skips the manual check for underage, fake and stolen-photo profiles. Only use it during testing.</Warn>
        ) : null}
        <div className="a-divider" />
        <Field label="Accepted ID types">
          <ChipEditor values={d.hostApply.idTypes} onChange={idTypes => ha({ idTypes })} placeholder="e.g. Voter ID" />
        </Field>
      </Card>
      <Card title="Limits">
        <Setting title="Guests in a live" description="How many viewers a host can bring on screen at once.">
          <NumInput value={d.limits.maxGuestsInLive} min={0} max={8} onChange={v => lim({ maxGuestsInLive: v })} />
        </Setting>
        <Setting title="Seats in a party room" description="Including the host’s seat.">
          <NumInput value={d.limits.maxRoomSeats} min={2} max={16} onChange={v => lim({ maxRoomSeats: v })} />
        </Setting>
        <Setting title="Ring timeout" description="A call is marked missed if the host doesn’t answer in time.">
          <NumInput value={d.limits.ringTimeoutSecs} min={10} max={90} affix="sec" onChange={v => lim({ ringTimeoutSecs: v })} />
        </Setting>
      </Card>
    </div>
  )
}

const hostsError = d => {
  const { minAge, requireId, idTypes } = d.hostApply
  if (!(minAge >= 18)) return 'Minimum age can’t be below 18'
  if (requireId && idTypes.length === 0) return 'Add at least one accepted ID type'
  const { maxGuestsInLive, maxRoomSeats, ringTimeoutSecs } = d.limits
  if (!(maxGuestsInLive >= 0 && maxGuestsInLive <= 8)) return 'Live guests must be 0–8'
  if (!(maxRoomSeats >= 2 && maxRoomSeats <= 16)) return 'Room seats must be 2–16'
  if (!(ringTimeoutSecs >= 10 && ringTimeoutSecs <= 90)) return 'Ring timeout must be 10–90 seconds'
  return null
}

function ModerationTab({ d, set }) {
  const m = patch => set({ moderation: { ...d.moderation, ...patch } })
  return (
    <div className="a-stack">
      <Card title="Auto-flag keywords" subtitle="Chats, bios, moments and live titles containing these words are flagged for review.">
        <ChipEditor values={d.moderation.autoFlagKeywords} lower onChange={autoFlagKeywords => m({ autoFlagKeywords })} placeholder="Add a word or phrase" />
      </Card>
      <Card title="Rules">
        <Setting title="Block contact sharing" description="Hides phone numbers, UPI IDs and social handles in chats and replaces them with ••••.">
          <Switch checked={d.moderation.blockContactSharing} onChange={v => m({ blockContactSharing: v })} />
        </Setting>
        <Setting title="Auto-suspend after reports" description="Suspends an account pending review once it gets this many open reports. 0 turns it off.">
          <NumInput value={d.moderation.maxReportsBeforeAutoSuspend} min={0} max={100} onChange={v => m({ maxReportsBeforeAutoSuspend: v })} />
        </Setting>
        <Setting title="Keep live recordings for review" description="Stores live streams for 7 days so reports can be checked.">
          <Switch checked={d.moderation.liveRecordingForReview} onChange={v => m({ liveRecordingForReview: v })} />
        </Setting>
      </Card>
    </div>
  )
}

const moderationError = d => {
  const n = d.moderation.maxReportsBeforeAutoSuspend
  return n === '' || n < 0 ? 'Enter a report count (0 to turn off)' : null
}

const PANELS = {
  general: [GeneralTab, generalError],
  login: [LoginTab, loginError],
  features: [FeaturesTab, () => null],
  hosts: [HostsTab, hostsError],
  moderation: [ModerationTab, moderationError],
}

function Editor({ tab, settings, onSave }) {
  const keys = TABS.find(t => t.value === tab).keys
  const saved = pick(settings, keys)
  const [draft, setDraft] = useState(saved)
  const [Panel, validate] = PANELS[tab]
  const dirty = !same(draft, saved)
  const error = dirty ? validate(draft) : null
  return (
    <>
      <Panel d={draft} set={patch => setDraft(x => ({ ...x, ...patch }))} />
      <SaveBar dirty={dirty} error={error} onDiscard={() => setDraft(saved)} onSave={() => onSave(draft)} />
    </>
  )
}

function ResetModal({ open, onClose, onReset }) {
  const [text, setText] = useState('')
  return (
    <Modal
      open={open}
      title="Reset demo data?"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={text !== 'RESET'} onClick={onReset}>
            Reset everything
          </Button>
        </>
      }
    >
      <div className="a-stack">
        <p className="a-muted">
          Every user, host, payment, setting and audit entry goes back to the original demo data. Changes made by all admins are lost. This can’t be undone.
        </p>
        <Field label={<>Type <span className="a-mono">RESET</span> to confirm</>}>
          <Input className="a-mono" value={text} onChange={e => setText(e.target.value)} autoFocus />
        </Field>
      </div>
    </Modal>
  )
}

export default function AppSettingsPage() {
  const { db, me, setConfig, reset, log } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState('general')
  const [resetting, setResetting] = useState(false)
  const settings = db.config.settings
  const superAdmin = me?.role === 'super_admin'

  const tabs = [...TABS, ...(superAdmin ? [{ value: 'danger', label: 'Danger zone' }] : [])]

  const save = draft => {
    const name = TABS.find(t => t.value === tab).label
    setConfig('settings', s => ({ ...s, ...draft }), [`Updated ${name} settings`, 'Settings'])
    toast(`${name} settings saved`)
  }

  return (
    <>
      <PageHeader title="App settings" subtitle="Controls for the REBU app. Saved changes reach every user’s app within a minute." />
      {settings.maintenance ? (
        <div style={{ marginBottom: 16 }}>
          <Warn tone="danger">The app is in maintenance mode. Users can’t use REBU until you turn it off in General.</Warn>
        </div>
      ) : null}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'danger' && superAdmin ? (
        <Card title="Danger zone" subtitle="Only super admins see this." style={{ borderColor: 'var(--danger)' }}>
          <Setting title="Reset demo data" description="Restores every collection and setting to the original demo data. Your sign-in stays.">
            <Button variant="soft-danger" icon={RotateCcw} onClick={() => setResetting(true)}>
              Reset demo data
            </Button>
          </Setting>
        </Card>
      ) : tab !== 'danger' ? (
        <Editor key={tab} tab={tab} settings={settings} onSave={save} />
      ) : null}

      {resetting ? (
        <ResetModal
          open
          onClose={() => setResetting(false)}
          onReset={() => {
            reset()
            log('Reset all demo data', 'System')
            setResetting(false)
            setTab('general')
            toast('Demo data reset')
          }}
        />
      ) : null}
    </>
  )
}
