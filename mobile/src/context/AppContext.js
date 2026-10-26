import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALLS, ME, TRANSACTIONS } from '../data/mock';
import { ECONOMY, hostBalance } from '../data/economy';

const AppContext = createContext(null);

const DEMO_CALLER = {
  name: 'Rahul',
  age: 27,
  photo: 'https://i.pravatar.cc/800?img=11',
};

// Everything below is saved on the device so a restart keeps the session.
const STORE_KEY = 'rebu.state.v1';
// Demo: an application is "reviewed by admin" this long after submitting.
const HOST_REVIEW_MS = 20000;
// Demo payout progress: requested → processing → paid.
const PAYOUT_PROCESSING_MS = 15000;
const PAYOUT_PAID_MS = 60000;
// Test hook: this agency code makes the demo review reject the application.
const DEMO_REJECT_CODE = 'REJECT';

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

const nowLabel = () => {
  const d = new Date();
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `Today, ${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};

export function AppProvider({ children }) {
  const [authed, setAuthed] = useState(false);
  const [profileDone, setProfileDone] = useState(false);
  const [user, setUser] = useState(ME);
  const [coins, setCoins] = useState(1450);
  const [isHost, setIsHost] = useState(false);
  // none | pending | approved
  const [hostApp, setHostApp] = useState({ status: 'none' });
  const [hostRates, setHostRates] = useState({ video: 40, voice: 20 });
  const [hydrated, setHydrated] = useState(false);
  const [hostOnline, setHostOnline] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callHistory, setCallHistory] = useState(CALLS);
  const [transactions, setTransactions] = useState(TRANSACTIONS);
  // Host money: one ledger entry per thing a user paid the host for.
  const [earnings, setEarnings] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [payoutMethods, setPayoutMethods] = useState([]);
  const [hostAgency, setHostAgency] = useState(null);
  const [liveSessions, setLiveSessions] = useState([]); // { ts, seconds }
  const [hostTasks, setHostTasks] = useState({ day: '', claimed: [] });
  // Social state (Moments, Rooms, Store, Tasks, Family)
  const [following, setFollowing] = useState(['h5']);
  const [greeted, setGreeted] = useState([]);
  const [likedMoments, setLikedMoments] = useState([]);
  const [myMoments, setMyMoments] = useState([]);
  const [myRooms, setMyRooms] = useState([]);
  const [owned, setOwned] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [vipLevel, setVipLevel] = useState(ME.vip || 0);
  const [nobility, setNobility] = useState(null);
  const [claimedTasks, setClaimedTasks] = useState([]);
  const [family, setFamily] = useState(null);
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

  // Demo: a host who goes online receives a call a few seconds later.
  useEffect(() => {
    if (!(isHost && hostOnline)) return;
    const t = setTimeout(
      () => setIncomingCall({ ...DEMO_CALLER, video: true }),
      6000,
    );
    return () => clearTimeout(t);
  }, [isHost, hostOnline]);

  // ---- Persistence -------------------------------------------------------
  const saved = {
    authed,
    profileDone,
    user,
    coins,
    isHost,
    hostApp,
    hostRates,
    callHistory,
    transactions,
    earnings,
    withdrawals,
    payoutMethods,
    hostAgency,
    liveSessions,
    hostTasks,
    following,
    greeted,
    likedMoments,
    myMoments,
    myRooms,
    owned,
    equipped,
    vipLevel,
    nobility,
    claimedTasks,
    family,
    filters,
  };
  const setters = useRef({
    authed: setAuthed,
    profileDone: setProfileDone,
    user: setUser,
    coins: setCoins,
    isHost: setIsHost,
    hostApp: setHostApp,
    hostRates: setHostRates,
    callHistory: setCallHistory,
    transactions: setTransactions,
    earnings: setEarnings,
    withdrawals: setWithdrawals,
    payoutMethods: setPayoutMethods,
    hostAgency: setHostAgency,
    liveSessions: setLiveSessions,
    hostTasks: setHostTasks,
    following: setFollowing,
    greeted: setGreeted,
    likedMoments: setLikedMoments,
    myMoments: setMyMoments,
    myRooms: setMyRooms,
    owned: setOwned,
    equipped: setEquipped,
    vipLevel: setVipLevel,
    nobility: setNobility,
    claimedTasks: setClaimedTasks,
    family: setFamily,
    filters: setFilters,
  }).current;

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then(raw => {
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.keys(setters).forEach(k => {
          if (data[k] !== undefined) setters[k](data[k]);
        });
        if (typeof data.coins === 'number') coinsRef.current = data.coins;
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, [setters]);

  const savedJson = JSON.stringify(saved);
  useEffect(() => {
    if (!hydrated) return;
    const t = setTimeout(
      () => AsyncStorage.setItem(STORE_KEY, savedJson).catch(() => {}),
      300,
    );
    return () => clearTimeout(t);
  }, [hydrated, savedJson]);

  // ---- Host application ----------------------------------------------------
  const addEarning = useCallback(
    rec =>
      setEarnings(list => [
        {
          id: `e${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          ts: Date.now(),
          status: 'settled',
          ...rec,
        },
        ...list,
      ]),
    [],
  );

  const submitHostApp = useCallback(data => {
    setHostApp({ status: 'pending', submittedAt: Date.now(), data });
    if (data.rates) setHostRates(data.rates);
  }, []);

  // Demo review: approve a pending application shortly after it's submitted.
  useEffect(() => {
    if (hostApp.status !== 'pending') return;
    const wait = Math.max(0, hostApp.submittedAt + HOST_REVIEW_MS - Date.now());
    const t = setTimeout(() => {
      if (hostApp.data?.agency === DEMO_REJECT_CODE) {
        setHostApp(a => ({
          ...a,
          status: 'rejected',
          reviewedAt: Date.now(),
          reasons: [
            'Your selfie didn’t clearly match your profile photos.',
            'The ID photo was blurry — all four corners must be readable.',
          ],
        }));
        return;
      }
      setHostApp(a => ({ ...a, status: 'approved', approvedAt: Date.now() }));
      setHostAgency(hostApp.data?.agency || null);
      setIsHost(true);
      addEarning({
        source: 'bonus',
        from: 'REBU',
        detail: 'New host welcome bonus',
        coins: ECONOMY.welcomeBonusCoins,
      });
    }, wait);
    return () => clearTimeout(t);
  }, [hostApp, addEarning]);

  // Demo payouts move along on their own (finance team on the backend).
  useEffect(() => {
    const open = withdrawals.filter(
      w => w.status === 'requested' || w.status === 'processing',
    );
    if (!open.length) return;
    const now = Date.now();
    const next = Math.min(
      ...open.map(w =>
        w.status === 'requested'
          ? w.ts + PAYOUT_PROCESSING_MS
          : w.ts + PAYOUT_PAID_MS,
      ),
    );
    const t = setTimeout(
      () =>
        setWithdrawals(list =>
          list.map(w => {
            const age = Date.now() - w.ts;
            if (w.status === 'requested' && age >= PAYOUT_PROCESSING_MS)
              return { ...w, status: 'processing' };
            if (w.status === 'processing' && age >= PAYOUT_PAID_MS)
              return { ...w, status: 'paid', paidAt: Date.now() };
            return w;
          }),
        ),
      Math.max(0, next - now) + 50,
    );
    return () => clearTimeout(t);
  }, [withdrawals]);

  // Level follows total connected call minutes.
  const callMinutes = useMemo(
    () =>
      earnings
        .filter(e => e.source === 'video' || e.source === 'voice')
        .reduce((n, e) => n + (e.minutes || 0), 0),
    [earnings],
  );
  const hostLevel = HOST_LEVELS.filter(l => callMinutes >= l.minutes).pop()
    .level;

  const addLiveSession = useCallback(
    seconds => setLiveSessions(list => [{ ts: Date.now(), seconds }, ...list]),
    [],
  );

  const balance = useMemo(
    () => hostBalance(earnings, withdrawals),
    [earnings, withdrawals],
  );

  const requestWithdrawal = useCallback((amount, method) => {
    const fee = Math.round((amount * ECONOMY.withdrawFee) / 100);
    const w = {
      id: `w${Date.now()}`,
      ts: Date.now(),
      amount,
      fee,
      net: amount - fee,
      method,
      status: 'requested',
    };
    setWithdrawals(list => [w, ...list]);
    return w;
  }, []);

  const reportEarning = useCallback(
    (id, reason) =>
      setEarnings(list =>
        list.map(e =>
          e.id === id ? { ...e, status: 'review', reportReason: reason } : e,
        ),
      ),
    [],
  );

  const spendCoins = useCallback(n => {
    if (coinsRef.current < n) return false;
    coinsRef.current -= n;
    setCoins(c => c - n);
    return true;
  }, []);

  const addCoins = useCallback(n => {
    coinsRef.current += n;
    setCoins(c => c + n);
  }, []);

  const addCall = useCallback(
    call =>
      setCallHistory(list => [
        { id: `k${Date.now()}`, time: nowLabel(), ...call },
        ...list,
      ]),
    [],
  );

  const addTransaction = useCallback(
    tx =>
      setTransactions(list => [
        { id: `t${Date.now()}`, time: nowLabel(), status: 'success', ...tx },
        ...list,
      ]),
    [],
  );

  const signOut = useCallback(() => {
    setAuthed(false);
    setProfileDone(false);
    setHostOnline(false);
    setIncomingCall(null);
  }, []);

  const deleteAccount = useCallback(() => {
    // Backend call goes here; locally wipe everything back to a fresh install.
    setUser(ME);
    setCoins(0);
    coinsRef.current = 0;
    setIsHost(false);
    setHostApp({ status: 'none' });
    setEarnings([]);
    setWithdrawals([]);
    setPayoutMethods([]);
    setHostAgency(null);
    setLiveSessions([]);
    setHostTasks({ day: '', claimed: [] });
    setCallHistory([]);
    setTransactions([]);
    signOut();
  }, [signOut]);

  const toggleIn = setter => id =>
    setter(list =>
      list.includes(id) ? list.filter(x => x !== id) : [...list, id],
    );
  const toggleFollow = useMemo(() => toggleIn(setFollowing), []);
  const toggleLike = useMemo(() => toggleIn(setLikedMoments), []);

  const value = useMemo(
    () => ({
      following,
      greeted,
      likedMoments,
      myMoments,
      myRooms,
      owned,
      equipped,
      vipLevel,
      nobility,
      claimedTasks,
      family,
      toggleFollow,
      toggleLike,
      greet: id => setGreeted(g => (g.includes(id) ? g : [...g, id])),
      addMoment: m => setMyMoments(list => [m, ...list]),
      addRoom: r => setMyRooms(list => [r, ...list]),
      buyItem: id => setOwned(o => (o.includes(id) ? o : [...o, id])),
      equipItem: (category, id) =>
        setEquipped(e => ({
          ...e,
          [category]: e[category] === id ? null : id,
        })),
      setVipLevel,
      setNobility,
      claimTask: id => setClaimedTasks(c => [...c, id]),
      setFamily,
      hydrated,
      authed,
      profileDone,
      user,
      coins,
      isHost,
      hostApp,
      hostRates,
      hostLevel,
      callMinutes,
      liveSessions,
      addLiveSession,
      hostTasks,
      setHostTasks,
      hostOnline,
      incomingCall,
      callHistory,
      transactions,
      earnings,
      withdrawals,
      payoutMethods,
      hostAgency,
      balance,
      filters,
      setUser,
      setHostRates,
      submitHostApp,
      setFilters,
      setIsHost,
      setHostOnline,
      setIncomingCall,
      setHostAgency,
      setPayoutMethods,
      addEarning,
      requestWithdrawal,
      signIn: () => setAuthed(true),
      completeProfile: () => setProfileDone(true),
      signOut,
      deleteAccount,
      spendCoins,
      addCoins,
      getCoins: () => coinsRef.current,
      addCall,
      addTransaction,
      reportEarning,
    }),
    [
      hydrated,
      authed,
      profileDone,
      user,
      coins,
      isHost,
      hostApp,
      hostRates,
      hostLevel,
      callMinutes,
      liveSessions,
      addLiveSession,
      hostTasks,
      submitHostApp,
      hostOnline,
      incomingCall,
      callHistory,
      transactions,
      earnings,
      withdrawals,
      payoutMethods,
      hostAgency,
      balance,
      addEarning,
      requestWithdrawal,
      filters,
      following,
      greeted,
      likedMoments,
      myMoments,
      myRooms,
      owned,
      equipped,
      vipLevel,
      nobility,
      claimedTasks,
      family,
      toggleFollow,
      toggleLike,
      signOut,
      deleteAccount,
      spendCoins,
      addCoins,
      addCall,
      addTransaction,
      reportEarning,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
