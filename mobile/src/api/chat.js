// Chat data from the server, shaped like the screens' existing rows/bubbles.
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

export function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const h = d.getHours();
  const hm = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${
    h < 12 ? 'AM' : 'PM'
  }`;
  if (sameDay) return hm;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const preview = m => {
  if (!m) return 'Say hi 👋';
  const p = m.mine ? 'You: ' : '';
  if (m.type === 'gift')
    return `${p}🎁 ${m.gift?.name || 'Gift'}${m.gift?.count > 1 ? ` ×${m.gift.count}` : ''}`;
  if (m.type === 'image') return `${p}📷 Photo`;
  return `${p}${m.text}`;
};

/** GET /chats item → chat list row. */
export function toAppChat(c) {
  return {
    id: c.id,
    userId: c.peer.id,
    name: c.peer.name,
    photo: c.peer.photo,
    online: !!c.peer.host?.online,
    isHost: !!c.peer.isHost,
    last: preview(c.lastMessage),
    time: timeLabel(c.lastAt || c.lastMessage?.createdAt),
    unread: c.unread || 0,
    pinned: !!c.pinned,
    peer: c.peer,
  };
}

/** Server message → chat bubble. */
export function toBubble(m, meId) {
  return {
    id: m.id,
    from: m.from === meId ? 'me' : 'them',
    type: m.type,
    text: m.text,
    uri: m.imageUrl,
    gift: m.gift?.key,
    giftInfo: m.gift,
    time: timeLabel(m.createdAt),
    read: !!m.readAt,
  };
}
