// Hosting is open to women only while the admin setting is on (default).
export const womenOnly = config =>
  config?.settings?.hostApply?.womenOnly !== false;

/** Whether this user may apply to host. */
export const canApplyToHost = (user, config) =>
  !womenOnly(config) || user?.gender === 'Female';

/** A short stable ID for a host, from their account id (shown in Host Center). */
export const hostIdLabel = user =>
  user?.id ? String(user.id).slice(-6).toUpperCase() : '—';

// Going live and opening rooms is for women only (admin: Live & rooms: women only).
export const liveWomenOnly = config =>
  config?.settings?.hostApply?.liveWomenOnly !== false;
export const canGoLive = (user, config) =>
  !(liveWomenOnly(config) && user?.gender === 'Male');
