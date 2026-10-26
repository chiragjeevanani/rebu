// Background jobs that need to start/stop with the server (call billing
// timers, ring timeouts, live cleanup). Modules register themselves here.
const starts = []
const stops = []

export const onStartup = fn => starts.push(fn)
export const onShutdown = fn => stops.push(fn)

export async function startupHooks() {
  for (const fn of starts) await fn()
}
export async function shutdownHooks() {
  for (const fn of stops) await fn()
}
