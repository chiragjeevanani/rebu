// Runs every module's end-to-end suite against the current code, each on its
// own fresh database and port.  Usage: node --env-file=.env scripts/test-all.js
import { spawn } from 'node:child_process'
import mongoose from 'mongoose'

const BASE_URI = 'mongodb://127.0.0.1:27027/'
const uri = db => `${BASE_URI}${db}?replicaSet=rs0`
const sleep = ms => new Promise(r => setTimeout(r, ms))

function run(cmd, args, env, { quiet } = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: quiet ? 'ignore' : ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout?.on('data', d => (out += d))
    p.stderr?.on('data', d => (out += d))
    p.on('exit', code => resolve({ code, out }))
  })
}

async function fresh(db) {
  const c = await mongoose.createConnection(uri(db)).asPromise()
  await c.dropDatabase()
  await c.close()
  await run('node', ['scripts/seed.js'], { MONGO_URI: uri(db) }, { quiet: true })
}

async function withServer(db, port, extraEnv, fn) {
  await fresh(db)
  const srv = spawn('node', ['src/server.js'], { env: { ...process.env, MONGO_URI: uri(db), PORT: String(port), ...extraEnv }, stdio: 'ignore' })
  for (let i = 0; i < 40; i++) {
    const ok = await fetch(`http://127.0.0.1:${port}/health`).then(r => r.ok).catch(() => false)
    if (ok) break
    await sleep(250)
  }
  try {
    return await fn()
  } finally {
    srv.kill()
    await sleep(500)
  }
}

const fastCalls = { CALL_BILLING_MS: '2000', CALL_RING_SECS: '3', CALL_DISCONNECT_GRACE_MS: '2000' }
const suites = [
  ['wallet + hosts', () => withServer('rebu_it_wallet', 4201, { RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '' }, () => run('node', ['scripts/test-wallet-hosts.js'], { API: 'http://127.0.0.1:4201', MONGO_URI: uri('rebu_it_wallet') }))],
  ['calls + chat + gifts', async () => {
    await fresh('rebu_it_calls')
    return run('node', ['scripts/test-calls.js'], { RAZORPAY_KEY_ID: '', TEST_MONGO_URI: uri('rebu_it_calls'), TEST_PORT: '4202', ...fastCalls })
  }],
  ['lives + rooms', () => withServer('rebu_it_lives', 4203, {}, () => run('node', ['scripts/test-lives.js'], { PORT: '4203', MONGO_URI: uri('rebu_it_lives') }))],
  ['social (moments, store, tasks, families, notifications)', () => withServer('rebu_it_social', 4205, {}, () => run('node', ['scripts/test-social.js'], { PORT: '4205', MONGO_URI: uri('rebu_it_social') }))],
  ['admin + reports', () => withServer('rebu_it_admin', 4204, {}, () => run('node', ['scripts/test-admin.js'], { API: 'http://127.0.0.1:4204', MONGO_URI: uri('rebu_it_admin') }))],
]

let failed = 0
// Optional filter: node scripts/test-all.js social
const only = process.argv[2]
for (const [name, fn] of suites.filter(([n]) => !only || n.includes(only))) {
  const { code, out } = await fn()
  const lines = out.trim().split('\n')
  const summary = lines.filter(l => /pass|fail|✗|FAIL|Error/i.test(l)).slice(-4).join('\n   ')
  console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${name}\n   ${summary || lines.slice(-2).join('\n   ')}`)
  if (code !== 0) failed++
}
process.exit(failed ? 1 : 0)
