import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ME } from '../data/mock';
import {
  APP_VERSION,
  del,
  get,
  loadToken,
  patch,
  post,
  put,
  setToken,
  setUnauthorizedHandler,
} from '../api/client';
import { connectSocket, disconnectSocket, onSocket } from '../api/socket';
import { refreshHosts } from '../api/hosts';
import { hostBalance } from '../data/economy';

const AppContext = createContext(null);

// Device-only preferences (everything else lives on the server).
const STORE_KEY = 'rebu.state.v2';

export const HOST_RATE_TIERS = {
  video: [30, 40, 60, 80, 100, 150, 200, 300],
  voice: [15, 20, 30, 40, 60, 80, 100, 150],
};
// Host levels: total connected call minutes needed, and the price cap unlocked.
export const HOST_LEVELS = [
  { level: 1, minutes: 0, maxRate: 60 },
  { level: 2, minutes: 300, maxRate: 100 },
  { level: 3, minutes: 1000, maxRate: 200 },
  { level: 4, minutes: 3000, maxRate: 300 },
];
export const HOST_LEVEL_MAX = Object.fromEntries(
  HOST_LEVELS.map(l => [l.level, l.maxRate]),
);

// Server user → the shape screens already use (photos[0], age, vip…).
const PLACEHOLDER = 'https://i.pravatar.cc/800?img=68';
export function toAppUser(u) {
  const age = u.dob
    ? Math.floor((Date.now() - new Date(u.dob).getTime()) / (365.25 * 864e5))
    : null;
  return {
    ...ME,
    id: u.id || u._id,
    phone: u.phone,
    name: u.name || '',
    gender: u.gender,
    age,
    dob: u.dob,
    city: u.city || '',
    bio: u.bio || '',
    photos: u.photos?.length ? u.photos : [PLACEHOLDER],
    verified: !!u.verified,
    vip: u.vip?.until && new Date(u.vip.until) > new Date() ? u.vip.level : 0,
    followers: u.followersCount || 0,
    following: (u.following || []).length,
    server: u,
  };
}

const EMPTY_STORE = {
  balance: null,
  diamonds: 0,
  vip: { level: 0, until: null },
  royal: null,
  owned: [],
  equipped: {},
};

export function AppProvider({ children }) {
  const [authed, setAuthed] = useState(false);
  const [profileDone, setProfileDone] = useState(false);
  const [user, setUser] = useState(ME);
  const [coins, setCoins] = useState(0);
  const [isHost, setIsHost] = useState(false);
  // none | pending | approved | rejected
  const [hostApp, setHostApp] = useState({ status: 'none' });
  const [hostRates, setHostRates] = useState({ video: 40, voice: 20 });
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState(null); // GET /config (prices, gifts, levels…)
  const [hostOnline, setHostOnline] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  // Host money (GET /host/*).
  const [earnings, setEarnings] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [hostAgency, setHostAgency] = useState(null);
  const [hostInfo, setHostInfo] = useState(null); // GET /host/me
  const [serverBalance, setServerBalance] = useState(null);
  // Social (GET /store, /social/greeted, /notifications).
  const [following, setFollowing] = useState([]);
  const [greeted, setGreeted] = useState([]);
  const [store, setStore] = useState(EMPTY_STORE);
  const [unread, setUnread] = useState(0);
  const [filters, setFilters] = useState({
    ageMin: 21,
    ageMax: 32,
    distance: 25,
    gender: 'Women',
    interests: [],
    verifiedOnly: false,
    onlineOnly: false,
  });

  // Coins live in a ref too so per-minute billing reads the latest balance.
  const coinsRef = useRef(coins);
  coinsRef.current = coins;
  const setCoinsFromServer = useCallback(n => {
    coinsRef.current = n;
    setCoins(n);
  }, []);

  // Incoming calls for hosts arrive over the socket (server rings us).
  useEffect(
    () =>
      onSocket('call:incoming', ({ call, caller }) =>
        setIncomingCall({
          ...caller,
          photos: caller.photos?.length ? caller.photos : [caller.photo],
          video: call.type === 'video',
          call,
        }),
      ),
    [],
  );

  // Availability lives on the server so users see the right online state.
  const setHostOnlineRemote = useCallback(on => {
    setHostOnline(on);
    patch('/host/me', { online: on }).catch(() => setHostOnline(!on));
  }, []);

  // ---- Device preferences ---------------------------------------------------
  const savedJson = JSON.stringify({ filters });

  // Latest host application, as the server sees it.
  const refreshHostApp = useCallback(async () => {
    const r = await get('/host/application').catch(() => null);
    const a = r?.application;
    setHostApp(
      a
        ? {
            status: a.status,
            submittedAt: new Date(a.createdAt).getTime(),
            approvedAt: a.reviewedAt ? new Date(a.reviewedAt).getTime() : null,
            reviewedAt: a.reviewedAt ? new Date(a.reviewedAt).getTime() : null,
            reasons: a.reasons || [],
            data: { ...a, agency: a.agencyCode, photos: a.photos },
          }
        : { status: 'none' },
    );
    return a;
  }, []);

  // Host money from the server: balance, ledger, payout accounts, withdrawals.
  const refreshHostMoney = useCallback(async () => {
    const [me, earn, wd, pm] = await Promise.all([
      get('/host/me'),
      get('/host/earnings?range=all&limit=100'),
      get('/host/withdrawals?limit=50'),
      get('/host/payout-methods'),
    ]).catch(() => []);
    if (!me) return;
    setHostInfo(me);
    setServerBalance(me.balance);
    setHostRates(me.host.rates);
    setHostOnline(!!me.host.online);
    setHostAgency(me.agency?.code || null);
    setEarnings(
      earn.items.map(e => ({
        ...e,
        from: e.fromName || 'User',
        // Server amounts are final; split() uses them as-is.
        agencyAmount: e.agency,
      })),
    );
    setWithdrawals(wd.items);
    setPayoutMethods(pm.items);
  }, []);

  /** Items, VIP, royal club, diamonds. Purchases return the same shape. */
  const applyStore = useCallback(
    s => {
      setStore({ ...EMPTY_STORE, ...s });
      if (typeof s.balance === 'number') setCoinsFromServer(s.balance);
    },
    [setCoinsFromServer],
  );
  const refreshStore = useCallback(
    () =>
      get('/store')
        .then(applyStore)
        .catch(() => {}),
    [applyStore],
  );

  const refreshUnread = useCallback(
    () =>
      get('/notifications?limit=1')
        .then(r => setUnread(r.unread))
        .catch(() => {}),
    [],
  );

  // ---- Server session ----------------------------------------------------
  const applyServerUser = useCallback(
    u => {
      setUser(toAppUser(u));
      setCoinsFromServer(u.coins);
      setProfileDone(!!u.profileDone);
      setIsHost(!!u.host?.approved);
      if (u.host?.approved) {
        setHostRates(u.host.rates);
        setHostOnline(!!u.host.online);
      }
      setFollowing((u.following || []).map(String));
    },
    [setCoinsFromServer],
  );

  const refreshMe = useCallback(async () => {
    const { user: u } = await get('/me');
    applyServerUser(u);
    return u;
  }, [applyServerUser]);

  const endSession = useCallback(async () => {
    disconnectSocket();
    await setToken(null);
    setAuthed(false);
    setProfileDone(false);
    setHostOnline(false);
    setIncomingCall(null);
    setStore(EMPTY_STORE);
    setGreeted([]);
    setUnread(0);
    setEarnings([]);
    setWithdrawals([]);
    setPayoutMethods([]);
    setHostInfo(null);
    setServerBalance(null);
  }, []);

  /** Everything a signed-in session loads once. */
  const loadSession = useCallback(() => {
    refreshHostApp();
    refreshHosts();
    refreshStore();
    refreshUnread();
    get('/social/greeted')
      .then(r => setGreeted(r.ids))
      .catch(() => {});
    // Tell the server which app build this is (push token comes with FCM).
    put('/me/device', { platform: Platform.OS, appVersion: APP_VERSION }).catch(
      () => {},
    );
  }, [refreshHostApp, refreshStore, refreshUnread]);

  /** After OTP verify: store the token, load the profile, open the socket. */
  const startSession = useCallback(
    async (token, u) => {
      await setToken(token);
      connectSocket(token);
      applyServerUser(u);
      setAuthed(true);
      loadSession();
    },
    [applyServerUser, loadSession],
  );

  const [hydratedSession, setHydratedSession] = useState(false);
  const [hydratedLocal, setHydratedLocal] = useState(false);
  useEffect(() => {
    setHydrated(hydratedSession && hydratedLocal);
  }, [hydratedSession, hydratedLocal]);

  useEffect(() => {
    setUnauthorizedHandler(() => endSession());
    get('/config')
      .then(setConfig)
      .catch(() => {});
    (async () => {
      const t = await loadToken();
      if (!t) return;
      try {
        const { user: u } = await get('/me');
        connectSocket(t);
        applyServerUser(u);
        setAuthed(true);
        loadSession();
      } catch (e) {
        if (e.status === 401 || e.status === 403) await setToken(null);
      }
    })().finally(() => setHydratedSession(true));
  }, [applyServerUser, endSession, loadSession]);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then(raw => {
        const data = raw ? JSON.parse(raw) : null;
        if (data?.filters) setFilters(data.filters);
      })
      .catch(() => {})
      .finally(() => setHydratedLocal(true));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(
      () => AsyncStorage.setItem(STORE_KEY, savedJson).catch(() => {}),
      300,
    );
    return () => clearTimeout(t);
  }, [hydrated, savedJson]);

  // Host money follows the server: load on sign-in, refresh on anything that pays.
  useEffect(() => {
    if (!authed || !isHost) return;
    refreshHostMoney();
    let t = null;
    const soon = () => {
      clearTimeout(t);
      t = setTimeout(refreshHostMoney, 800);
    };
    const offs = [
      'call:ended',
      'gift:received',
      'chat:message',
      'live:gift',
      'withdrawal:update',
      'dispute:update',
    ].map(ev => onSocket(ev, soon));
    return () => {
      clearTimeout(t);
      offs.forEach(off => off());
    };
  }, [authed, isHost, refreshHostMoney]);

  // Server pushes that change the wallet or the inbox.
  useEffect(() => {
    const balance = p => {
      if (typeof p?.balance === 'number') setCoinsFromServer(p.balance);
    };
    const offs = [
      onSocket('call:tick', balance),
      onSocket('call:ended', balance),
      onSocket('wallet:update', balance),
      onSocket('notification:new', () => setUnread(n => n + 1)),
      onSocket('host:application', () => {
        refreshMe().catch(() => {});
        refreshHostApp();
      }),
    ];
    return () => offs.forEach(off => off());
  }, [refreshMe, refreshHostApp, setCoinsFromServer]);

  // ---- Host ---------------------------------------------------------------
  const addEarning = useCallback(() => {
    refreshHostMoney();
  }, [refreshHostMoney]);

  // Level follows total connected call minutes.
  const callMinutes = useMemo(
    () =>
      hostInfo?.callMinutes ??
      earnings
        .filter(e => e.source === 'video' || e.source === 'voice')
        .reduce((n, e) => n + (e.minutes || 0), 0),
    [earnings, hostInfo],
  );
  const hostLevel =
    hostInfo?.level ??
    HOST_LEVELS.filter(l => callMinutes >= l.minutes).pop().level;

  const balance = useMemo(
    () => serverBalance || hostBalance(earnings, withdrawals),
    [serverBalance, earnings, withdrawals],
  );

  const requestWithdrawal = useCallback(async (amount, methodId) => {
    const r = await post('/host/withdrawals', { amount, methodId });
    setServerBalance(r.balance);
    setWithdrawals(list => [r.withdrawal, ...list]);
    return r.withdrawal;
  }, []);

  const reportEarning = useCallback(
    async (id, reason) => {
      await post(`/host/earnings/${id}/report`, { reason });
      await refreshHostMoney();
    },
    [refreshHostMoney],
  );

  const addPayoutMethod = useCallback(async m => {
    const r = await post('/host/payout-methods', m);
    setPayoutMethods(list => [...list, r.method]);
    return r.method;
  }, []);

  const removePayoutMethod = useCallback(async id => {
    await del(`/host/payout-methods/${id}`);
    setPayoutMethods(list => list.filter(x => x.id !== id));
  }, []);

  const saveHostRates = useCallback(async rates => {
    const r = await patch('/host/me', { rates });
    setHostRates(r.host.rates);
  }, []);

  const joinAgency = useCallback(async code => {
    if (!code) {
      await del('/host/agency');
      setHostAgency(null);
      return;
    }
    const r = await post('/host/agency', { code });
    setHostAgency(r.agency.code);
  }, []);

  // ---- Store ----------------------------------------------------------------
  const storeCall = useCallback(
    async (path, body) => {
      const r = await post(path, body);
      applyStore(r);
      refreshMe().catch(() => {});
      return r;
    },
    [applyStore, refreshMe],
  );
  const buyItem = useCallback(
    id => storeCall(`/store/items/${id}/buy`),
    [storeCall],
  );
  const equipItem = useCallback(
    (category, itemId) => storeCall('/store/equip', { category, itemId }),
    [storeCall],
  );
  const buyVip = useCallback(
    level => storeCall('/store/vip', { level }),
    [storeCall],
  );
  const buyRoyal = useCallback(
    key => storeCall('/store/royal', { key }),
    [storeCall],
  );
  const exchangeDiamonds = useCallback(
    diamonds => storeCall('/store/diamonds/exchange', { diamonds }),
    [storeCall],
  );

  const vipLevel = store.vip?.level || 0;
  const nobility = useMemo(
    () =>
      store.royal
        ? (config?.royalClub || []).find(t => t.key === store.royal.key) || {
            key: store.royal.key,
          }
        : null,
    [store.royal, config],
  );
  const owned = useMemo(() => store.owned.map(o => o.itemId), [store.owned]);

  // ---- Social -----------------------------------------------------------------
  /** Free "Say hi" (once per person). Resolves true when sent. */
  const greet = useCallback(async (id, text) => {
    try {
      await post(`/social/greet/${id}`, text ? { text } : {});
    } catch (e) {
      if (e.code !== 'already_greeted') throw e;
    }
    setGreeted(g => (g.includes(id) ? g : [...g, id]));
    return true;
  }, []);

  // Optimistic: flip locally, then tell the server (roll back if it fails).
  const followingRef = useRef(following);
  followingRef.current = following;
  const toggleFollow = useCallback(id => {
    const on = !followingRef.current.includes(id);
    setFollowing(l => (on ? [...l, id] : l.filter(x => x !== id)));
    const path = `/me/following/${id}`;
    (on ? post(path) : del(path)).catch(() =>
      setFollowing(l => (on ? l.filter(x => x !== id) : [...l, id])),
    );
  }, []);

  const signOut = useCallback(() => {
    endSession();
  }, [endSession]);

  const deleteAccount = useCallback(async () => {
    await del('/me');
    setUser(ME);
    setIsHost(false);
    setHostApp({ status: 'none' });
    await endSession();
  }, [endSession]);

  const value = useMemo(
    () => ({
      hydrated,
      config,
      authed,
      profileDone,
      user,
      coins,
      isHost,
      hostApp,
      hostRates,
      hostLevel,
      callMinutes,
      hostOnline,
      incomingCall,
      earnings,
      withdrawals,
      payoutMethods,
      hostAgency,
      hostInfo,
      balance,
      filters,
      following,
      greeted,
      store,
      vipLevel,
      nobility,
      owned,
      equipped: store.equipped || {},
      diamonds: store.diamonds || 0,
      unread,
      startSession,
      refreshMe,
      refreshHostApp,
      refreshHostMoney,
      refreshStore,
      refreshUnread,
      setUnread,
      applyServerUser,
      setCoinsFromServer,
      getCoins: () => coinsRef.current,
      setUser,
      setFilters,
      setIsHost,
      setHostOnline: setHostOnlineRemote,
      setIncomingCall,
      setHostRates: saveHostRates,
      setHostAgency: joinAgency,
      setPayoutMethods,
      addEarning,
      requestWithdrawal,
      addPayoutMethod,
      removePayoutMethod,
      reportEarning,
      buyItem,
      equipItem,
      buyVip,
      buyRoyal,
      exchangeDiamonds,
      greet,
      toggleFollow,
      signIn: () => setAuthed(true),
      completeProfile: () => setProfileDone(true),
      signOut,
      deleteAccount,
    }),
    [
      hydrated,
      config,
      authed,
      profileDone,
      user,
      coins,
      isHost,
      hostApp,
      hostRates,
      hostLevel,
      callMinutes,
      hostOnline,
      incomingCall,
      earnings,
      withdrawals,
      payoutMethods,
      hostAgency,
      hostInfo,
      balance,
      filters,
      following,
      greeted,
      store,
      vipLevel,
      nobility,
      owned,
      unread,
      startSession,
      refreshMe,
      refreshHostApp,
      refreshHostMoney,
      refreshStore,
      refreshUnread,
      applyServerUser,
      setCoinsFromServer,
      setHostOnlineRemote,
      saveHostRates,
      joinAgency,
      addEarning,
      requestWithdrawal,
      addPayoutMethod,
      removePayoutMethod,
      reportEarning,
      buyItem,
      equipItem,
      buyVip,
      buyRoyal,
      exchangeDiamonds,
      greet,
      toggleFollow,
      signOut,
      deleteAccount,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
