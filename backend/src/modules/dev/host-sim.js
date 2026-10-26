// Dev-only "host simulator": a browser page that acts as a demo host so one
// phone can test real calls. It signs in as the host (by phone), goes online,
// auto-accepts incoming calls and joins the Agora channel with the browser's
// camera (a fake test pattern when Chrome runs with --use-fake-device-for-media-stream).
import { Router } from 'express'
import { User } from '../users/user.model.js'
import { signUserToken } from '../../core/auth.js'

export const hostSim = Router()

hostSim.get('/host-sim', async (req, res) => {
  const phone = String(req.query.phone || '9000000001')
  const host = await User.findOne({ phone, 'host.approved': true })
  if (!host) return res.status(404).send('No approved host with that phone')
  host.host.online = true
  host.host.busy = false
  await host.save()
  const token = signUserToken(host)
  res.set('content-security-policy', '')
  res.type('html').send(`<!doctype html><meta charset="utf-8">
<title>Host sim · ${host.host.displayName || host.name}</title>
<body style="font-family:system-ui;margin:16px">
<h3>Host simulator · ${host.host.displayName || host.name} (${phone})</h3>
<div id="st">connecting…</div>
<div style="display:flex;gap:8px;margin-top:8px">
  <div id="local" style="width:240px;height:320px;background:#222"></div>
  <div id="remote" style="width:240px;height:320px;background:#444"></div>
</div>
<pre id="log" style="font-size:12px"></pre>
<script src="https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/dist/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.9/AgoraRTC_N-production.js"></script>
<script>
const TOKEN = ${JSON.stringify(token)};
const log = (...a) => { const l = document.getElementById('log'); l.textContent = new Date().toLocaleTimeString() + ' ' + a.join(' ') + '\\n' + l.textContent; console.log(...a) };
const st = t => { document.getElementById('st').textContent = t; window.SIM_STATE = t };
const api = (m, p, b) => fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: b && JSON.stringify(b) }).then(r => r.json());
AgoraRTC.setLogLevel(3);
let client = null, tracks = [];
async function join(agora, video) {
  client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('host');
  client.on('user-published', async (user, type) => {
    await client.subscribe(user, type);
    if (type === 'video') user.videoTrack.play('remote');
    if (type === 'audio') user.audioTrack.play();
    log('remote published', type, user.uid);
  });
  await client.join(agora.appId, agora.channel, agora.token, agora.uid);
  tracks = video ? await AgoraRTC.createMicrophoneAndCameraTracks() : [await AgoraRTC.createMicrophoneAudioTrack()];
  if (video) tracks[1].play('local');
  await client.publish(tracks);
  log('joined + publishing', agora.channel, 'uid', agora.uid);
  st('in call');
}
async function leave() {
  tracks.forEach(t => { t.stop(); t.close() });
  tracks = [];
  if (client) await client.leave();
  client = null;
  st('online, waiting for calls');
}
// ?live=1 → start a live, auto-accept join requests and chat back.
const LIVE = new URLSearchParams(location.search).get('live');
async function goLive() {
  await api('POST', '/lives/' + (window.LIVE_ID || 'x') + '/end').catch(() => {});
  const r = await api('POST', '/lives', { mode: 'live', title: 'Chai pe charcha ☕', allowGuests: true });
  if (r.error) { log('go live failed', r.error.message); return }
  window.LIVE_ID = r.live.id;
  log('LIVE started', r.live.id, 'mock =', r.agora.mock);
  await join(r.agora, true);
  st('LIVE ' + r.live.id);
}
const socket = io({ transports: ['websocket'], auth: { token: TOKEN, kind: 'user' } });
socket.on('live:viewer_joined', p => log('viewer joined', p.user.name, 'viewers', p.viewers));
socket.on('live:chat', async p => {
  log('live chat', p.message.user?.name, ':', p.message.text);
  if (p.message.user?.id === ${JSON.stringify(String(host._id))}) return;
  await new Promise(r => setTimeout(r, 1500));
  await api('POST', '/lives/' + p.liveId + '/chat', { text: 'Thanks for joining ' + (p.message.user?.name || '') + ' 💕' });
});
socket.on('live:gift', p => log('live gift', p.gift.emoji, p.gift.name, 'diamonds', p.diamonds));
socket.on('live:request', async p => {
  log('join request from', p.user.name);
  await new Promise(r => setTimeout(r, 2000));
  const r = await api('POST', '/lives/' + p.liveId + '/requests/' + p.user.id + '/accept');
  log('accepted guest', r.error ? r.error.message : 'ok');
});
socket.on('connect', () => { st('online, waiting for calls'); log('socket connected'); if (LIVE && !window.LIVE_ID) goLive() });
socket.on('call:incoming', async ({ call, caller }) => {
  log('incoming', call.type, 'from', caller.name);
  st('ringing');
  await new Promise(r => setTimeout(r, 2500));
  const r = await api('POST', '/calls/' + call.id + '/accept');
  if (r.error) { log('accept failed', r.error.message); st('online, waiting for calls'); return }
  log('accepted; agora mock =', r.agora.mock);
  await join(r.agora, call.type === 'video');
});
socket.on('call:ended', p => { log('call ended', p.reason, 'earned', p.earned); leave() });
socket.on('gift:received', p => log('gift received', p.gift.emoji, p.gift.name, 'from', p.from.name));
const ME = ${JSON.stringify(String(host._id))};
const REPLIES = ['Hey! 😊 So nice to hear from you', 'Haha that’s sweet 🙈', 'Want to video call? I’m online now 📹', 'Tell me more!'];
let n = 0;
socket.on('chat:message', async p => {
  const m = p.message;
  log('chat from', p.from?.name, ':', m.text || m.type);
  if (m.from === ME) return;
  await new Promise(r => setTimeout(r, 2000));
  const r = await api('POST', '/chats/' + m.from + '/messages', { type: 'text', text: REPLIES[n++ % REPLIES.length] });
  log('replied', r.message ? 'ok (free for hosts)' : JSON.stringify(r.error));
});
</script></body>`)
})

// Caller simulator: signs in as a test user and calls a host by phone, so a
// phone signed in as a host can test receiving calls. Hangs up after ?secs.
hostSim.get('/user-sim', async (req, res) => {
  const phone = String(req.query.phone || '9111111111')
  const to = await User.findOne({ phone: String(req.query.to || '9999999999'), 'host.approved': true })
  if (!to) return res.status(404).send('No approved host with that phone')
  const type = req.query.type === 'voice' ? 'voice' : 'video'
  const secs = Number(req.query.secs) || 75
  const me = await User.findOneAndUpdate(
    { phone },
    { $setOnInsert: { phone, name: 'Rohan', profileDone: true, gender: 'Male' }, $max: { coins: 5000 } },
    { upsert: true, returnDocument: 'after' },
  )
  const token = signUserToken(me)
  res.set('content-security-policy', '')
  res.type('html').send(`<!doctype html><meta charset="utf-8">
<title>Caller sim · ${me.name}</title>
<body style="font-family:system-ui;margin:16px">
<h3>Caller simulator · ${me.name} (${phone}) → ${to.host.displayName || to.name}</h3>
<div id="st">starting…</div>
<div style="display:flex;gap:8px;margin-top:8px">
  <div id="local" style="width:240px;height:320px;background:#222"></div>
  <div id="remote" style="width:240px;height:320px;background:#444"></div>
</div>
<pre id="log" style="font-size:12px"></pre>
<script src="https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/dist/socket.io.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/agora-rtc-sdk-ng@4.24.9/AgoraRTC_N-production.js"></script>
<script>
const TOKEN = ${JSON.stringify(token)};
const log = (...a) => { const l = document.getElementById('log'); l.textContent = new Date().toLocaleTimeString() + ' ' + a.join(' ') + '\\n' + l.textContent; console.log(...a) };
const st = t => { document.getElementById('st').textContent = t; window.SIM_STATE = t };
const api = (m, p, b) => fetch('/api' + p, { method: m, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: b && JSON.stringify(b) }).then(r => r.json());
AgoraRTC.setLogLevel(3);
let client = null, tracks = [], CALL = null;
async function join(agora, video) {
  client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
  await client.setClientRole('host');
  client.on('user-published', async (user, t) => {
    await client.subscribe(user, t);
    if (t === 'video') user.videoTrack.play('remote');
    if (t === 'audio') user.audioTrack.play();
    log('remote published', t, user.uid);
  });
  await client.join(agora.appId, agora.channel, agora.token, agora.uid);
  tracks = video ? await AgoraRTC.createMicrophoneAndCameraTracks() : [await AgoraRTC.createMicrophoneAudioTrack()];
  if (video) tracks[1].play('local');
  await client.publish(tracks);
  log('joined + publishing', agora.channel);
}
async function leave() {
  tracks.forEach(t => { t.stop(); t.close() });
  tracks = [];
  if (client) await client.leave();
  client = null;
}
const socket = io({ transports: ['websocket'], auth: { token: TOKEN, kind: 'user' } });
socket.on('connect', async () => {
  if (CALL) return;
  log('socket connected');
  const r = await api('POST', '/calls', { hostId: ${JSON.stringify(String(to._id))}, type: ${JSON.stringify(type)} });
  if (r.error) { st('call failed: ' + r.error.message); return }
  CALL = r.call;
  st('ringing ' + CALL.id);
  window.AGORA = r.agora;
});
socket.on('call:accepted', async () => {
  st('connected');
  await join(window.AGORA, ${JSON.stringify(type === 'video')});
  setTimeout(async () => {
    const e = await api('POST', '/calls/' + CALL.id + '/end');
    log('hung up', e.error ? e.error.message : 'ok');
  }, ${secs * 1000});
});
socket.on('call:tick', p => log('tick minute', p.minute, 'balance', p.balance));
socket.on('call:ended', p => { st('ended: ' + p.reason); log('ended', JSON.stringify(p)); leave() });
</script></body>`)
})
