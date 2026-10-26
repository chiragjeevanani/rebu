import { useContext } from 'react'
import { StoreContext } from '../data/store-context'

/**
 * Admin session + shared data:
 *   me                       – signed-in admin from the backend (or null)
 *   auth                     – 'checking' | 'in' | 'out'
 *   login(email, password)   → Promise<error string | null>,  logout()
 *   db.config                – app config from GET /admin/config
 *   setConfig(key, value)    → Promise<saved value> (PUT /admin/config/:key; value may be (old) => new)
 *   configMeta               – { [key]: { updatedBy, updatedAt } }
 *   counts, refreshCounts()  – sidebar badges (pending applications, open reports, …)
 *   db, update/create/remove – client-side mock, only for data the backend doesn't serve yet
 * Everything else comes from the API directly (see api/client.js, hooks/useApi.js).
 */
export const useStore = () => useContext(StoreContext)
