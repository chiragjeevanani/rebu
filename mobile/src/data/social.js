// Mock data for the social features (Moments, Rooms, Store, Tasks, Family…)
// until the backend APIs exist.
import { HOSTS } from './mock';

const pic = (id, w = 600, h = 800) =>
  `https://picsum.photos/id/${id}/${w}/${h}`;
const host = id => HOSTS.find(h => h.id === id);

export const TOPICS = [
  { key: 'song', label: 'Song requests' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'selfie', label: 'Selfie' },
  { key: 'love', label: 'Love' },
  { key: 'new', label: 'Say hello' },
  { key: 'travel', label: 'Travel diaries' },
];

export const MOMENTS = [
  {
    id: 'mo1',
    hostId: 'h1',
    type: 'photo',
    media: pic(64),
    topic: 'love',
    text: 'Sunday vibes ☀️',
    time: '19 hours ago',
    likes: 25,
    comments: 5,
  },
  {
    id: 'mo2',
    hostId: 'h5',
    type: 'video',
    media: pic(292),
    duration: '0:22',
    topic: 'new',
    text: 'Cooking my mom’s recipe today 🍲',
    time: '1 day ago',
    likes: 48,
    comments: 12,
  },
  {
    id: 'mo3',
    hostId: 'h3',
    type: 'photo',
    media: pic(1011),
    topic: 'travel',
    text: 'Lake mornings are the best mornings',
    time: '2 days ago',
    likes: 132,
    comments: 21,
  },
  {
    id: 'mo4',
    hostId: 'h2',
    type: 'photo',
    media: pic(1027),
    topic: 'selfie',
    text: 'New hair, who dis? 💁‍♀️',
    time: '2 days ago',
    likes: 87,
    comments: 9,
  },
  {
    id: 'mo5',
    hostId: 'h8',
    type: 'video',
    media: pic(1015),
    duration: '0:41',
    topic: 'travel',
    text: 'Kerala backwaters — call me and I’ll tell you everything',
    time: '3 days ago',
    likes: 64,
    comments: 7,
  },
  {
    id: 'mo6',
    hostId: 'h6',
    type: 'photo',
    media: pic(1062),
    topic: 'beauty',
    text: 'Trying a new look today 💄',
    time: '4 days ago',
    likes: 39,
    comments: 4,
  },
].map(m => ({ ...m, host: host(m.hostId) }));

export const MOMENT_COMMENTS = [
  {
    id: 'c1',
    name: 'Rahul',
    photo: 'https://i.pravatar.cc/200?img=11',
    text: 'Beautiful 😍',
    time: '2h',
  },
  {
    id: 'c2',
    name: 'Vikram',
    photo: 'https://i.pravatar.cc/200?img=13',
    text: 'Where is this?',
    time: '5h',
  },
  {
    id: 'c3',
    name: 'Karan',
    photo: 'https://i.pravatar.cc/200?img=14',
    text: 'Calling you tonight!',
    time: '8h',
  },
];

// kind: voice | video · category: Music | Chat | Friendship | Games
export const ROOMS = [
  {
    id: 'r1',
    title: 'Midnight Melodies',
    welcome: 'Unplugged covers every night 🎸',
    category: 'Music',
    kind: 'video',
    count: 11,
    cover: 'https://i.pravatar.cc/400?img=59',
    hostId: 'h1',
  },
  {
    id: 'r2',
    title: 'Bollywood Antakshari',
    welcome: 'Pick a song, sing the next one 🎤',
    category: 'Music',
    kind: 'voice',
    count: 7,
    cover: 'https://i.pravatar.cc/400?img=44',
    hostId: 'h2',
  },
  {
    id: 'r3',
    title: 'Chai & Charcha ☕',
    welcome: 'Tea-time talks about everything',
    category: 'Chat',
    kind: 'voice',
    count: 9,
    cover: 'https://i.pravatar.cc/400?img=45',
    hostId: 'h3',
  },
  {
    id: 'r4',
    title: 'Good Vibes Only ✨',
    welcome: 'Positive talks to end your day',
    category: 'Chat',
    kind: 'voice',
    count: 5,
    cover: 'https://i.pravatar.cc/400?img=48',
    hostId: 'h5',
  },
  {
    id: 'r5',
    title: 'Weekend Hangout',
    welcome: 'Meet new friends from your city 🙌',
    category: 'Friendship',
    kind: 'voice',
    count: 4,
    cover: pic(1074, 400, 400),
    hostId: 'h8',
  },
  {
    id: 'r6',
    title: 'Lo-fi Lounge 🎧',
    welcome: 'Late night music & stories',
    category: 'Music',
    kind: 'video',
    count: 3,
    cover: 'https://i.pravatar.cc/400?img=20',
    hostId: 'h7',
  },
  {
    id: 'r7',
    title: 'Story Circle 📖',
    welcome: 'Share a story, hear a story',
    category: 'Chat',
    kind: 'voice',
    count: 3,
    cover: pic(1005, 400, 400),
    hostId: 'h4',
  },
  {
    id: 'r8',
    title: 'Ask Me Anything',
    welcome: 'Curious? Ask away 💬',
    category: 'Chat',
    kind: 'video',
    count: 3,
    cover: 'https://i.pravatar.cc/400?img=24',
    hostId: 'h6',
  },
].map(r => ({ ...r, host: host(r.hostId) }));

export const ROOM_CATEGORIES = ['Chat', 'Music', 'Friendship', 'Games'];

export const ROOM_CHAT = [
  {
    id: 'rc1',
    name: 'System',
    text: 'Welcome to the room! Be kind and respectful 💜',
    system: true,
  },
  { id: 'rc2', name: 'Rahul', text: 'Hello everyone 👋' },
  { id: 'rc3', name: 'Vikram', text: 'Play my request please 🎵' },
  { id: 'rc4', name: 'Karan', text: 'sent a 🌹 Rose', gift: true },
];

export const VIP_TIERS = [
  {
    level: 1,
    name: 'VIP 1',
    price: 199,
    days: 30,
    color: ['#F5B301', '#F5B301'],
    perks: ['VIP badge', '5% off calls', '20 bonus coins / day'],
  },
  {
    level: 2,
    name: 'VIP 2',
    price: 499,
    days: 30,
    color: ['#F5B301', '#F5B301'],
    perks: [
      'VIP badge',
      '10% off calls',
      '50 bonus coins / day',
      'Exclusive chat bubble',
    ],
  },
  {
    level: 3,
    name: 'VIP 3',
    price: 999,
    days: 30,
    color: ['#D81B60', '#D81B60'],
    perks: [
      'Everything in VIP 2',
      '15% off calls',
      'Entry effect in rooms',
      'Priority in Spark',
    ],
  },
  {
    level: 4,
    name: 'VIP Elite',
    price: 2499,
    days: 30,
    color: ['#1C1C1E', '#1C1C1E'],
    perks: [
      'Everything in VIP 3',
      '20% off calls',
      '200 bonus coins / day',
      'Hidden visitor mode',
      'Dedicated support',
    ],
  },
];

export const ARISTOCRACY = [
  {
    key: 'silver',
    name: 'Silver Crown',
    emoji: '🥈',
    price: 4999,
    perks: ['Crown badge on profile', 'Room entry banner', '300 coins back'],
  },
  {
    key: 'gold',
    name: 'Gold Crown',
    emoji: '🥇',
    price: 9999,
    perks: [
      'Everything in Silver',
      'Exclusive avatar frame',
      'Mic priority in rooms',
      '800 coins back',
    ],
  },
  {
    key: 'platinum',
    name: 'Platinum Crown',
    emoji: '🏰',
    price: 24999,
    perks: [
      'Everything in Gold',
      'Animated entry effect',
      'Anti-kick in rooms',
      '2,500 coins back',
    ],
  },
  {
    key: 'diamond',
    name: 'Diamond Crown',
    emoji: '👑',
    price: 49999,
    perks: [
      'Everything in Platinum',
      'Global entrance announcement',
      'Custom room theme',
      '6,000 coins back',
    ],
  },
];

// category: frame | entry | bubble
export const STORE_ITEMS = [
  {
    id: 's1',
    category: 'frame',
    name: 'Rose Frame',
    emoji: '🌹',
    price: 299,
    days: 7,
  },
  {
    id: 's2',
    category: 'frame',
    name: 'Royal Frame',
    emoji: '👑',
    price: 999,
    days: 7,
  },
  {
    id: 's3',
    category: 'frame',
    name: 'Neon Heart',
    emoji: '💗',
    price: 499,
    days: 7,
  },
  {
    id: 's4',
    category: 'entry',
    name: 'Sports Car Entry',
    emoji: '🏎️',
    price: 1499,
    days: 7,
  },
  {
    id: 's5',
    category: 'entry',
    name: 'Fireworks Entry',
    emoji: '🎆',
    price: 799,
    days: 7,
  },
  {
    id: 's6',
    category: 'entry',
    name: 'Rocket Entry',
    emoji: '🚀',
    price: 1999,
    days: 7,
  },
  {
    id: 's7',
    category: 'bubble',
    name: 'Candy Bubble',
    emoji: '🍬',
    price: 199,
    days: 7,
  },
  {
    id: 's8',
    category: 'bubble',
    name: 'Galaxy Bubble',
    emoji: '🌌',
    price: 399,
    days: 7,
  },
];

export const TASKS = [
  {
    id: 'tk1',
    group: 'Daily',
    title: 'Check in today',
    reward: 10,
    goal: 1,
    progress: 1,
  },
  {
    id: 'tk2',
    group: 'Daily',
    title: 'Make a video call',
    reward: 20,
    goal: 1,
    progress: 0,
  },
  {
    id: 'tk3',
    group: 'Daily',
    title: 'Say Hi to 3 hosts',
    reward: 15,
    goal: 3,
    progress: 1,
  },
  {
    id: 'tk4',
    group: 'Daily',
    title: 'Spend 10 minutes in a room',
    reward: 15,
    goal: 10,
    progress: 4,
  },
  {
    id: 'tk5',
    group: 'Newbie',
    title: 'Complete your profile',
    reward: 50,
    goal: 1,
    progress: 1,
  },
  {
    id: 'tk6',
    group: 'Newbie',
    title: 'Follow 5 hosts',
    reward: 30,
    goal: 5,
    progress: 2,
  },
  {
    id: 'tk7',
    group: 'Newbie',
    title: 'Make your first recharge',
    reward: 100,
    goal: 1,
    progress: 1,
  },
];

export const FAMILIES = [
  {
    id: 'f1',
    name: 'Star Talent',
    emoji: '⭐',
    members: 248,
    level: 12,
    weekly: 1840000,
    desc: 'Top hosts & friendly members. Weekly coin rewards!',
  },
  {
    id: 'f2',
    name: 'Dil Se Family',
    emoji: '💖',
    members: 189,
    level: 9,
    weekly: 920000,
    desc: 'Music nights every Friday in our room.',
  },
  {
    id: 'f3',
    name: 'Royal Squad',
    emoji: '👑',
    members: 132,
    level: 8,
    weekly: 640000,
    desc: 'Active members get monthly gifts.',
  },
  {
    id: 'f4',
    name: 'Chai Pe Charcha',
    emoji: '☕',
    members: 76,
    level: 5,
    weekly: 210000,
    desc: 'Chill conversations, no drama.',
  },
];

export const VISITORS = [
  { id: 'v1', hostId: 'h3', time: '5m ago', times: 3 },
  { id: 'v2', hostId: 'h1', time: '1h ago', times: 1 },
  { id: 'v3', hostId: 'h6', time: '3h ago', times: 2 },
  { id: 'v4', hostId: 'h8', time: 'Yesterday', times: 1 },
  { id: 'v5', hostId: 'h4', time: '2 days ago', times: 1 },
].map(v => ({ ...v, host: host(v.hostId) }));

export const EVENTS = [
  {
    id: 'e1',
    title: 'Diwali Gift Festival',
    sub: 'Send festival gifts, win up to 50,000 coins',
    colors: ['#D81B60', '#D81B60'],
    ends: 'Ends in 3 days',
    tag: 'Hot',
  },
  {
    id: 'e2',
    title: 'Weekend Recharge Bonus',
    sub: '20% extra coins on every recharge',
    colors: ['#F5B301', '#F5B301'],
    ends: 'Sat–Sun',
    tag: 'Live',
  },
  {
    id: 'e3',
    title: 'Room Star of the Week',
    sub: 'Top room host wins a Royal Frame',
    colors: ['#1C1C1E', '#1C1C1E'],
    ends: 'Ends Sunday',
  },
  {
    id: 'e4',
    title: 'Invite friends, earn coins',
    sub: '100 coins for each friend who recharges',
    colors: ['#1E9E5A', '#1E9E5A'],
    ends: 'Always on',
  },
];

export const LEADERBOARD = {
  hosts: HOSTS.slice()
    .sort((a, b) => b.followers - a.followers)
    .map((h, i) => ({
      rank: i + 1,
      name: h.name,
      photo: h.photo,
      score: h.followers * 13,
      host: h,
    })),
  givers: ['Arjun', 'Rahul', 'Vikram', 'Karan', 'Rohan', 'Aditya', 'Sahil'].map(
    (n, i) => ({
      rank: i + 1,
      name: n,
      photo: `https://i.pravatar.cc/200?img=${11 + i}`,
      score: Math.round(98000 / (i + 1)),
    }),
  ),
};

export const GREETINGS = [
  'Hi 👋',
  'Hello! How are you?',
  'Hey, can we talk?',
  'Namaste 🙏',
];
