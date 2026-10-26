import { useContext } from 'react'
import { ToastContext } from '../data/toast-context'

/** toast('Saved') or toast('Failed', 'error') */
export const useToast = () => useContext(ToastContext)
