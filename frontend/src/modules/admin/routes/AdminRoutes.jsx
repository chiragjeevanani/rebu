import { Navigate, Route, Routes } from 'react-router-dom'
import { CloudOff, Loader2, Lock } from 'lucide-react'
import { useStore } from '../hooks/useStore'
import { canAccess } from './nav'
import Layout from '../components/Layout'
import { Button, Empty } from '../components/ui'

import LoginPage from '../pages/LoginPage'
import DashboardPage from '../pages/DashboardPage'
import UsersPage from '../pages/users/UsersPage'
import UserDetailPage from '../pages/users/UserDetailPage'
import HostsPage from '../pages/hosts/HostsPage'
import HostDetailPage from '../pages/hosts/HostDetailPage'
import TargetsPage from '../pages/hosts/TargetsPage'
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
import SenderFramesPage from '../pages/monetization/SenderFramesPage'
import VipPage from '../pages/monetization/VipPage'
import StoreTasksPage from '../pages/monetization/StoreTasksPage'
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

function Splash({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="a-card" style={{ minWidth: 320 }}>
        {children}
      </div>
    </div>
  )
}

export default function AdminRoutes() {
  const { me, auth, bootError, retryBoot, logout } = useStore()

  if (auth === 'checking') {
    return (
      <Splash>
        {bootError ? (
          <div className="a-stack" style={{ alignItems: 'center', paddingBottom: 18 }}>
            <Empty icon={CloudOff} title="Can’t load the admin console" text={bootError} />
            <div className="a-row">
              <Button onClick={logout}>Sign out</Button>
              <Button variant="primary" onClick={retryBoot}>
                Try again
              </Button>
            </div>
          </div>
        ) : (
          <Empty icon={Loader2} title="Loading…" text="Signing you in to the REBU admin console." />
        )}
      </Splash>
    )
  }

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
        <Route path="host-targets" element={g('hosts', <TargetsPage />)} />
        <Route path="host-targets/:id" element={g('hosts', <TargetsPage />)} />
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
        <Route path="monetization/frames" element={g('monetization', <SenderFramesPage />)} />
        <Route path="monetization/vip" element={g('monetization', <VipPage />)} />
        <Route path="monetization/store" element={g('monetization', <StoreTasksPage />)} />
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
