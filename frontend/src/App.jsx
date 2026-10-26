import { Navigate, Route, Routes } from 'react-router-dom'
import AdminApp from './modules/admin/AdminApp'

// One entry per module (admin now; website and agency panels later).
export default function App() {
  return (
    <Routes>
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}
