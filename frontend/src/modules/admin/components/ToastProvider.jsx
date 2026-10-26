import { useCallback, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { ToastContext } from '../data/toast-context'

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((text, kind = 'success') => {
    const id = Math.random()
    setToasts(t => [...t, { id, text, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="a-toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="a-toast">
            {t.kind === 'error' ? (
              <CircleAlert size={18} color="#ff6b6e" />
            ) : (
              <CircleCheck size={18} color="#3ccf86" />
            )}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
