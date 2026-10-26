// Hosts from the server, shaped like the old mock HOSTS so every screen keeps
// working. One shared cache; screens read it with useHosts().
import { useEffect, useState } from 'react';
import { get, getToken } from './client';

const EMOJI = ['💝', '😍', '🥰', '✨', '🌸', '💫', '🌙', '🎶'];

export function toAppHost(p) {
  const h = p.host || {};
  const seed = String(p.id)
    .split('')
    .reduce((n, c) => n + c.charCodeAt(0), 0);
  return {
    id: p.id,
    name: p.name,
    age: p.age,
    city: p.city || '',
    country: '🇮🇳',
    photo: p.photo,
    photos: p.photos?.length ? p.photos : [p.photo],
    bio: p.bio || '',
    verified: p.verified,
    isHost: !!p.isHost,
    vip: p.vip || 0,
    online: !!h.online,
    busy: !!h.busy,
    videoRate: h.rates?.video ?? 40,
    voiceRate: h.rates?.voice ?? 20,
    rating: h.rating ?? 5,
    level: h.level ?? 1,
    languages: h.languages || [],
    followers: p.followers || 0,
    interests: [],
    // Set when the host is broadcasting: the feed opens their live room.
    liveId: p.live?.id || null,
    liveMode: p.live?.mode || null,
    emoji: p.isHost ? EMOJI[seed % EMOJI.length] : '',
    gender: p.gender,
    distanceKm: (seed % 90) / 10 + 0.5,
  };
}

let cache = [];
let loaded = false;
const subs = new Set();
let inflight = null;

export function refreshHosts() {
  if (inflight) return inflight;
  if (!getToken()) return Promise.resolve(cache); // not signed in yet
  inflight = get('/hosts?limit=100&sort=popular')
    .then(r => {
      cache = r.items.map(toAppHost);
      loaded = true;
      subs.forEach(fn => fn(cache));
      return cache;
    })
    .catch(() => cache)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const getHosts = () => cache;
export const findHost = id => cache.find(h => h.id === id);

/** All hosts (refreshed on mount and every 20s while mounted). */
export function useHosts() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    subs.add(setList);
    if (!loaded) refreshHosts();
    const t = setInterval(refreshHosts, 20000);
    return () => {
      subs.delete(setList);
      clearInterval(t);
    };
  }, []);
  return list;
}
