import { useCallback, useEffect, useState } from 'react'
import { request, toQuery } from '../api/client'
import { onAdminEvent } from '../api/socket'

/**
 * GET `path` with `query` and keep the result:
 *   { data, error, loading, reload, setData }
 * Refetches when the path or query changes; keeps the previous data while
 * loading so tables don't flash. Pass path = null to skip.
 */
export function useApi(path, query) {
  const url = path ? `${path}${toQuery(query)}` : null
  const [tick, setTick] = useState(0)
  const [state, setState] = useState({ key: null, data: undefined, error: null })
  const key = url ? `${url}#${tick}` : null

  useEffect(() => {
    if (!url) return
    const ctrl = new AbortController()
    const k = `${url}#${tick}`
    request(url, { signal: ctrl.signal }).then(
      data => setState({ key: k, data, error: null }),
      error => {
        if (error?.name !== 'AbortError') setState(s => ({ key: k, data: s.data, error }))
      },
    )
    return () => ctrl.abort()
  }, [url, tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  const setData = useCallback(fn => setState(s => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), [])

  return { data: state.data, error: state.error, loading: !!key && state.key !== key, reload, setData }
}

/** Run `handler` on admin socket events (e.g. ['report:new', 'live:ended']). */
export function useAdminEvent(events, handler) {
  const names = [].concat(events).join(',')
  useEffect(() => {
    const offs = names.split(',').map(ev => onAdminEvent(ev, handler))
    return () => offs.forEach(off => off())
  }, [names, handler])
}

/**
 * Paging + sort state for server-side tables. `filters` is the page's filter
 * object; when it changes the page goes back to 1. Spread `query` into the
 * request and pass `table` to <DataTable>.
 */
export function usePaging(filters, limit = 20, initialSort = null) {
  const fk = JSON.stringify(filters || {})
  const [state, setState] = useState({ fk, page: 1, sort: initialSort })
  const page = state.fk === fk ? state.page : 1
  const sort = state.sort
  const setPage = p => setState(s => ({ ...s, fk, page: typeof p === 'function' ? p(page) : p }))
  const setSort = next => setState({ fk, page: 1, sort: next })
  return {
    page,
    setPage,
    sort,
    setSort,
    limit,
    query: { ...(filters || {}), page, limit, ...(sort ? { sort: sort.key, dir: sort.dir } : {}) },
  }
}

/** Props for <DataTable> in server mode from a usePaging() + useApi() pair. */
export const serverTable = (pg, res) => ({
  server: true,
  total: res.data?.total || 0,
  page: pg.page,
  pageSize: pg.limit,
  onPageChange: pg.setPage,
  sort: pg.sort,
  onSortChange: pg.setSort,
  loading: res.loading,
  error: res.error,
  onRetry: res.reload,
})
