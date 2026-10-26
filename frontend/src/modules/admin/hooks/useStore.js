import { useContext } from 'react'
import { StoreContext } from '../data/store-context'

/**
 * Admin data + actions:
 *   db                      – every collection (see data/seed.js for shapes)
 *   me                      – signed-in admin (or null)
 *   update(col, id, patch, audit?)   patch: object or (item) => object
 *   create(col, item, audit?)        prepends; returns the item with an id
 *   remove(col, id, audit?)
 *   setConfig(key, value, audit?)    value: new value or (old) => new
 *   log(action, target)              write to the audit log
 *   login(email, password) → error string | null,  logout(),  reset()
 */
export const useStore = () => useContext(StoreContext)
