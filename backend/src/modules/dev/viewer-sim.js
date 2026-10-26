// Dev-only "viewer simulator": joins a host's live as a test user so a phone
// that goes live has a real audience. It watches over Agora, chats, sends a
// gift and asks to join on video; when accepted it publishes its (fake) camera.
import { Router } from 'express'
import { User } from '../users/user.model.js'
import { signUserToken } from '../../core/auth.js'

export const viewerSim = Router()

viewerSim.get('/viewer-sim', async (req, res) => {
  const phone = String(req.query.phone || '9111111111')
  const to = await User.findOne({ phone: String(req.query.to || '9999999999') })
  if (!to) return res.status(404).send('No user with that phone')
  const me = await User.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, name: 'Rohan', profileDone: true, gender: 'Male' }, $max: { coins: 5000 } },
    { upsert: true, returnDocument: 'after' },
  )
  const token = signUserToken(me)
  res.set('content-security-policy', '')
  res.type('html').send(`<!doctype html><meta charset="utf-8">
<title>Viewer sim · ${me.name}</title>
<body style="font-family:system-ui;margin:16px">
<h3>Viewer simulator · ${me.name} (${phone}) watching ${to.host?.displayName || to.name}</h3>
<div id="st">waiting for a live…</div>
<div style="display:flex;gap:8px;margin-top:8px">
  <div id="remote" style="width:240px;height:320px;background:#444"></div>
  <div id="local" style="width:240px;height:320px;background:#222"></div>
</div>
<pre id="log" style="font-size:12px"></pre>
<script src="https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/dist/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.9/AgoraRTC_N-production.js"></script>
<script>
const TOKEN = ${JSON.stringify(token)};
const OWNER = ${JSON.stringify(String(to._id))};
const OPTS = new URLSearchParams(location.search);
const log = (...a) => { const l = document.getElementById('log'); l.textContent = new Date().toLocaleTimeString() + ' ' + a.join(' ') + '\\n' + l.textContent; console.log(...a) };
const st = t => { document.getElementById('st').textContent = t; window.SIM_STATE = t };
const api = (m, p, b) => fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: b && JSON.stringify(b) }).then(r => r.json());
const sleep = ms => new Promise(r => setTimeout(r, ms));
AgoraRTC.setLogLevel(3);
let client = null, tracks = [], LIVE = null;

async function connect(agora) {
  if (!client) {
    client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
    client.on('user-published', async (user, t) => {
      await client.subscribe(user, t);
      if (t === 'video' && user.uid !== agora.uid) user.videoTrack.play('remote');
      if (t === 'audio') user.audioTrack.play();
      log('remote published', t, user.uid);
    });
    await client.setClientRole(agora.role === 'publisher' ? 'host' : 'audience');
    await client.join(agora.appId, agora.channel, agora.token, agora.uid);
    log('joined', agora.channel, 'as', agora.role);
  } else {
    await client.renewToken(agora.token);
    await client.setClientRole(agora.role === 'publisher' ? 'host' : 'audience');
    log('role ->', agora.role);
  }
  if (agora.role === 'publisher' && !tracks.length) {
    tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    tracks[1].play('local');
    await client.publish(tracks);
    log('publishing camera');
  }
  if (agora.role !== 'publisher' && tracks.length) {
    await client.unpublish(tracks);
    tracks.forEach(t => { t.stop(); t.close() });
    tracks = [];
    log('stopped publishing');
  }
}

async function watch(liveId) {
  LIVE = liveId;
  const j = await api('POST', '/lives/' + liveId + '/join');
  if (j.error) { log('join failed', j.error.message); LIVE = null; return }
  st('watching ' + liveId);
  await connect(j.agora);
  await sleep(4000);
  await api('POST', '/lives/' + liveId + '/chat', { text: 'Hi Arjun! 👋 Loving the stream' });
  log('chatted');
  await sleep(4000);
  const g = await api('POST', '/gifts', { toId: OWNER, giftKey: 'rose', context: { type: 'live', id: liveId } });
  log('gift', g.error ? g.error.message : 'rose sent, balance ' + g.balance);
  if (OPTS.get('join') !== '0') {
    await sleep(4000);
    const r = await api('POST', '/lives/' + liveId + '/requests');
    log('requested to join', r.error ? r.error.message : 'ok');
  }
}

const socket = io({ transports: ['websocket'], auth: { token: TOKEN, kind: 'user' } });
socket.on('connect', () => log('socket connected'));
socket.on('live:chat', p => p.message.user?.id !== ${JSON.stringify(String(me._id))} && log('chat', p.message.user?.name, ':', p.message.text));
socket.on('live:accepted', async p => { log('accepted on stage'); await connect(p.agora) });
socket.on('live:removed', async p => { log('removed from stage'); if (p.agora) await connect(p.agora) });
socket.on('live:ended', async () => {
  log('live ended');
  st('live ended');
  tracks.forEach(t => { t.stop(); t.close() });
  tracks = [];
  if (client) await client.leave();
  client = null;
  LIVE = null;
});

// Poll for the host's live.
// Poll for the host's live (and follow it if the host restarts).
setInterval(async () => {
  const r = await api('GET', '/lives?limit=50');
  const live = (r.items || []).find(l => l.owner?.id === OWNER);
  if (!live || live.id === LIVE) return;
  if (client) { tracks.forEach(t => { t.stop(); t.close() }); tracks = []; await client.leave(); client = null }
  watch(live.id);
}, 3000);
</script></body>`)
})
