import { Navigate, Route, Routes } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { canAccess } from './nav'
import Layout from '../components/Layout'
import { Empty } from '../components/ui'

import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import UsersPage from '../pages/users/UsersPage'
import UserDetailPage from '../pages/users/UserDetailPage'
import HostsPage from '../pages/hosts/HostsPage'
import HostDetailPage from '../pages/hosts/HostDetailPage'
import ApplicationsPage from '../pages/hosts/ApplicationsPage'
import ApplicationReviewPage from '../pages/hosts/ApplicationReviewPage'
import AgenciesPage from '../pages/hosts/AgenciesPage'
import CallsPage from '../pages/activity/CallsPage'
import LivesPage from '../pages/activity/LivesPage'
import MomentsPage from '../pages/activity/MomentsPage'
import ReportsPage from '../pages/safety/ReportsPage'
import SupportPage from '../pages/safety/SupportPage'
import RevenuePage from '../pages/finance/RevenuePage'
import TransactionsPage from '../pages/finance/TransactionsPage'
import WithdrawalsPage from '../pages/finance/WithdrawalsPage'
import DisputesPage from '../pages/finance/DisputesPage'
import EconomyPage from '../pages/monetization/EconomyPage'
import CoinPacksPage from '../pages/monetization/CoinPacksPage'
import GiftsPage from '../pages/monetization/GiftsPage'
import HostLevelsPage from '../pages/monetization/HostLevelsPage'
import VipPage from '../pages/monetization/VipPage'
import BannersPage from '../pages/content/BannersPage'
import NotificationsPage from '../pages/content/NotificationsPage'
import PagesPage from '../pages/content/PagesPage'
import AppSettingsPage from '../pages/settings/AppSettingsPage'
import AdminsPage from '../pages/settings/AdminsPage'
import AuditPage from '../pages/settings/AuditPage'

/** Shows the page only if the signed-in admin's role covers its section. */
function Guard({ section, children }) {
  const { me } = useStore()
  if (canAccess(me.role, section)) return children
  return (
    <div className="a-card">
      <Empty icon={Lock} title="No access" text="Your role doesn’t include this section. Ask a super admin if you need it." />
    </div>
  )
}

const g = (section, el) => <Guard section={section}>{el}</Guard>

export default function AdminRoutes() {
  const { me } = useStore()

  if (!me) {
    return (
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="login" element={<Navigate to="/admin" replace />} />
      <Route element={<Layout />}>
        <Route index element={g('dashboard', <DashboardPage />)} />
        <Route path="users" element={g('users', <UsersPage />)} />
        <Route path="users/:id" element={g('users', <UserDetailPage />)} />
        <Route path="hosts" element={g('hosts', <HostsPage />)} />
        <Route path="hosts/:id" element={g('hosts', <HostDetailPage />)} />
        <Route path="host-applications" element={g('applications', <ApplicationsPage />)} />
        <Route path="host-applications/:id" element={g('applications', <ApplicationReviewPage />)} />
        <Route path="agencies" element={g('agencies', <AgenciesPage />)} />
        <Route path="calls" element={g('calls', <CallsPage />)} />
        <Route path="lives" element={g('lives', <LivesPage />)} />
        <Route path="moments" element={g('moments', <MomentsPage />)} />
        <Route path="reports" element={g('reports', <ReportsPage />)} />
        <Route path="support" element={g('support', <SupportPage />)} />
        <Route path="finance/revenue" element={g('finance', <RevenuePage />)} />
        <Route path="finance/transactions" element={g('finance', <TransactionsPage />)} />
        <Route path="finance/withdrawals" element={g('finance', <WithdrawalsPage />)} />
        <Route path="finance/disputes" element={g('finance', <DisputesPage />)} />
        <Route path="monetization/economy" element={g('monetization', <EconomyPage />)} />
        <Route path="monetization/coin-packs" element={g('monetization', <CoinPacksPage />)} />
        <Route path="monetization/gifts" element={g('monetization', <GiftsPage />)} />
        <Route path="monetization/host-levels" element={g('monetization', <HostLevelsPage />)} />
        <Route path="monetization/vip" element={g('monetization', <VipPage />)} />
        <Route path="content/banners" element={g('content', <BannersPage />)} />
        <Route path="content/notifications" element={g('content', <NotificationsPage />)} />
        <Route path="content/pages" element={g('content', <PagesPage />)} />
        <Route path="settings" element={g('settings', <AppSettingsPage />)} />
        <Route path="settings/admins" element={g('admins', <AdminsPage />)} />
        <Route path="settings/audit" element={g('audit', <AuditPage />)} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
