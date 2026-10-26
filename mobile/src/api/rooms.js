// Rooms are lives in 'party' (video) or 'audio' (voice) mode on the server.
import { get, post } from './client';

/** Server live → the room card / room screen shape. */
export function toAppRoom(l) {
  return {
    id: l.id,
    title: l.title,
    welcome: l.welcome || '',
    category: l.category || 'Chat',
    kind: l.mode === 'party' ? 'video' : 'voice',
    mode: l.mode,
    count: (l.viewers || 0) + 1 + (l.guests?.length || 0),
    cover: l.cover || l.owner?.photo,
    owner: l.owner,
    seats: l.maxGuests,
    startedAt: l.startedAt,
  };
}

export const listRooms = () =>
  get('/lives?mode=party,audio&limit=50').then(r => r.items.map(toAppRoom));

/** Opens a room; returns { room, agora } for RoomScreen. */
export async function createRoom({ title, welcome, category, kind, cover }) {
  const r = await post('/lives', {
    mode: kind === 'video' ? 'party' : 'audio',
    title,
    welcome,
    category,
    allowGuests: true,
    // A room someone lost track of (app killed) is closed first.
    replace: true,
    ...(/^https?:/.test(cover || '') && { cover }),
  });
  return { room: toAppRoom(r.live), agora: r.agora };
}
