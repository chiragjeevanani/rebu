import http from 'node:http'
import { env } from './config/env.js'
import { connectDb, disconnectDb } from './config/db.js'
import { loadConfig } from './modules/config/config.service.js'
import { initRealtime } from './core/realtime.js'
import { callSocketHooks } from './modules/calls/calls.service.js'
import { rejoinLiveRooms } from './modules/lives/lives.service.js'
import { createApp } from './app.js'
import { startupHooks, shutdownHooks } from './hooks.js'

await connectDb()
await loadConfig()

const server = http.createServer(createApp())
// Ends a call if a participant's last socket drops and doesn't come back;
// a reconnecting socket gets its live rooms back.
initRealtime(server, {
  ...callSocketHooks,
  onConnect(socket) {
    callSocketHooks.onConnect(socket)
    rejoinLiveRooms(socket).catch(e => console.error('[lives] rejoin', e))
  },
})
await startupHooks()

server.listen(env.port, () => {
  console.log(`[api] REBU backend on http://localhost:${env.port}  (${env.nodeEnv})`)
})

async function shutdown(signal) {
  console.log(`[api] ${signal} — shutting down`)
  await shutdownHooks()
  server.close()
  await disconnectDb()
  process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
