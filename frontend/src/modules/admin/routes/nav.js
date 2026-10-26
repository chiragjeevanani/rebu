import {
  BadgeCheck,
  BarChart3,
  BellRing,
  Building2,
  CircleDollarSign,
  Coins,
  Crown,
  FileText,
  Flag,
  Gift,
  Image,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  PhoneCall,
  Radio,
  ReceiptText,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'

export const ROLES = {
  super_admin: { label: 'Super admin', sections: '*' },
  moderator: {
    label: 'Moderator',
    sections: ['dashboard', 'users', 'hosts', 'applications', 'agencies', 'calls', 'lives', 'moments', 'reports', 'support', 'content'],
  },
  finance: {
    label: 'Finance',
    sections: ['dashboard', 'users', 'hosts', 'agencies', 'finance', 'monetization'],
  },
  support: {
    label: 'Support',
    sections: ['dashboard', 'users', 'hosts', 'calls', 'reports', 'support'],
  },
}

export const canAccess = (role, section) => {
  const r = ROLES[role]
  if (!r) return false
  return r.sections === '*' || r.sections.includes(section)
}

/** Sidebar. `section` drives permissions; `badge(counts)` shows a live counter (see StoreProvider counts). */
export const NAV = [
  {
    title: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, section: 'dashboard', end: true }],
  },
  {
    title: 'People',
    items: [
      { to: '/admin/users', label: 'Users', icon: UserRound, section: 'users' },
      { to: '/admin/hosts', label: 'Hosts', icon: UsersRound, section: 'hosts' },
      {
        to: '/admin/host-applications',
        label: 'Host applications',
        icon: BadgeCheck,
        section: 'applications',
        badge: c => c.pendingApplications,
      },
      { to: '/admin/agencies', label: 'Agencies', icon: Building2, section: 'agencies' },
    ],
  },
  {
    title: 'Activity',
    items: [
      { to: '/admin/calls', label: 'Calls', icon: PhoneCall, section: 'calls' },
      {
        to: '/admin/lives',
        label: 'Lives & rooms',
        icon: Radio,
        section: 'lives',
        badge: c => c.liveNow,
      },
      { to: '/admin/moments', label: 'Moments', icon: Image, section: 'moments' },
    ],
  },
  {
    title: 'Safety & support',
    items: [
      {
        to: '/admin/reports',
        label: 'Reports',
        icon: Flag,
        section: 'reports',
        badge: c => c.openReports,
      },
      {
        to: '/admin/support',
        label: 'Support tickets',
        icon: LifeBuoy,
        section: 'support',
        badge: c => c.openTickets,
      },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/admin/finance/revenue', label: 'Revenue', icon: BarChart3, section: 'finance' },
      { to: '/admin/finance/transactions', label: 'Transactions', icon: ReceiptText, section: 'finance' },
      {
        to: '/admin/finance/withdrawals',
        label: 'Withdrawals',
        icon: Wallet,
        section: 'finance',
        badge: c => c.withdrawalsRequested,
      },
      {
        to: '/admin/finance/disputes',
        label: 'Earning disputes',
        icon: Scale,
        section: 'finance',
        badge: c => c.openDisputes,
      },
    ],
  },
  {
    title: 'Monetization',
    items: [
      { to: '/admin/monetization/economy', label: 'Economy & commission', icon: CircleDollarSign, section: 'monetization' },
      { to: '/admin/monetization/coin-packs', label: 'Coin packs', icon: Coins, section: 'monetization' },
      { to: '/admin/monetization/gifts', label: 'Gifts', icon: Gift, section: 'monetization' },
      { to: '/admin/monetization/host-levels', label: 'Host levels & prices', icon: Sparkles, section: 'monetization' },
      { to: '/admin/monetization/vip', label: 'VIP & Royal Club', icon: Crown, section: 'monetization' },
      { to: '/admin/monetization/store', label: 'Store, tasks & families', icon: ShoppingBag, section: 'monetization' },
    ],
  },
  {
    title: 'Content',
    items: [
      { to: '/admin/content/banners', label: 'Banners & events', icon: Megaphone, section: 'content' },
      { to: '/admin/content/notifications', label: 'Push notifications', icon: BellRing, section: 'content' },
      { to: '/admin/content/pages', label: 'Pages & policies', icon: FileText, section: 'content' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/settings', label: 'App settings', icon: Settings, section: 'settings', end: true },
      { to: '/admin/settings/admins', label: 'Admins & roles', icon: ShieldCheck, section: 'admins' },
      { to: '/admin/settings/audit', label: 'Audit log', icon: ScrollText, section: 'audit' },
    ],
  },
]
