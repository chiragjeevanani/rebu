import { useEffect, useMemo, useState } from 'react'
import './styles/admin.css'
import StoreProvider from './data/StoreProvider'
import ToastProvider from './components/ToastProvider'
import { ThemeContext } from './data/theme-context'
import AdminRoutes from './routes/AdminRoutes'

const THEME_KEY = 'rebu.admin.theme'

export default function AdminApp() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'light'
    } catch {
      return 'light'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // Private mode — theme just isn't remembered.
    }
  }, [theme])
  const themeValue = useMemo(() => ({ theme, setTheme }), [theme])

  return (
    <ThemeContext.Provider value={themeValue}>
      <div className="admin" data-theme={theme}>
        <StoreProvider>
          <ToastProvider>
            <AdminRoutes />
          </ToastProvider>
        </StoreProvider>
      </div>
    </ThemeContext.Provider>
  )
}
