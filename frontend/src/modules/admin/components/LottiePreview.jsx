import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../api/client'

// Parsed animation JSON by URL, so re-renders and repeated gifts don't refetch.
const cache = new Map()
const loadJson = url => {
  if (!cache.has(url)) {
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return cache.get(url)
}

// The light SVG player (no expressions/eval) is enough for previews; loaded on first use.
let player = null
const loadPlayer = () => (player ??= import('lottie-web/build/player/lottie_light').then(m => m.default || m))

/** Looping preview of a Lottie animation URL. Falls back to `fallback` while loading or on error. */
export default function LottiePreview({ src, size = 64, fallback = null }) {
  const box = useRef(null)
  const [state, setState] = useState({ src: null, status: 'idle' })
  const status = state.src === src ? state.status : src ? 'loading' : 'idle'

  useEffect(() => {
    if (!src) return
    let anim = null
    let dead = false
    Promise.all([loadPlayer(), loadJson(assetUrl(src))])
      .then(([lottie, data]) => {
        if (dead || !box.current) return
        // lottie mutates the data it's given, so each player gets its own copy.
        anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: true, animationData: structuredClone(data) })
        setState({ src, status: 'ready' })
      })
      .catch(() => !dead && setState({ src, status: 'error' }))
    return () => {
      dead = true
      anim?.destroy()
    }
  }, [src])

  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flexShrink: 0 }}>
      <span ref={box} style={{ position: 'absolute', inset: 0, visibility: status === 'ready' ? 'visible' : 'hidden' }} />
      {status !== 'ready' ? (
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }} title={status === 'error' ? 'Animation couldn’t be loaded' : undefined}>
          {fallback}
        </span>
      ) : null}
    </span>
  )
}
