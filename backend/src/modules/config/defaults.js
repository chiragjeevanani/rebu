// Starting values for every admin-editable setting. Kept in sync with
// mobile/src/data/economy.js and the admin panel's seed until both read
// GET /config from this server.
const HOST_CATEGORIES = [
  { key: 'iron', name: 'Iron', fromLevel: 1, maxRate: 60, commissionDiscount: 0, color: '#6B7280' },
  { key: 'bronze', name: 'Bronze', fromLevel: 11, maxRate: 80, commissionDiscount: 0, color: '#B07A47' },
  { key: 'silver', name: 'Silver', fromLevel: 21, maxRate: 100, commissionDiscount: 1, color: '#8A96A3' },
  { key: 'gold', name: 'Gold', fromLevel: 31, maxRate: 150, commissionDiscount: 2, color: '#D49B00' },
  { key: 'platinum', name: 'Platinum', fromLevel: 41, maxRate: 200, commissionDiscount: 4, color: '#3E9EAA' },
  { key: 'diamond', name: 'Diamond', fromLevel: 46, maxRate: 300, commissionDiscount: 6, color: '#6C4DE6' },
]
const categoryOf = level => [...HOST_CATEGORIES].reverse().find(c => level >= c.fromLevel)
const HOST_LEVELS = Array.from({ length: 50 }, (_, i) => {
  const level = i + 1
  const c = categoryOf(level)
  return {
    level,
    // Gift coins received to reach this level (gentle curve: ~1k for L2, ~1.1M for L50).
    giftCoins: level === 1 ? 0 : Math.round((500 * (level - 1) ** 1.9) / 100) * 100,
    category: c.key,
    maxRate: c.maxRate,
    commissionDiscount: c.commissionDiscount,
  }
})

export const DEFAULT_CONFIG = {
  // Users get a frame by lifetime coins bought (all recharges, bonus included).
  senderTiers: [
    { key: 'none', name: 'No frame', minCoins: 0, color: '' },
    { key: 'bronze', name: 'Bronze', minCoins: 1000, color: '#B07A47' },
    { key: 'silver', name: 'Silver', minCoins: 5000, color: '#9AA4AE' },
    { key: 'gold', name: 'Gold', minCoins: 20000, color: '#E0A800' },
    { key: 'platinum', name: 'Platinum', minCoins: 60000, color: '#5DADB8' },
    { key: 'diamond', name: 'Diamond', minCoins: 150000, color: '#6C4DE6' },
  ],
  economy: {
    coinInr: 0.8,
    commission: { video: 40, voice: 40, chat: 50, gift: 50, ticket: 40, bonus: 0 },
    agencyCut: 10,
    withdrawFee: 2,
    minWithdraw: 500,
    maxWithdrawPerDay: 50000,
    payoutTime: '24–48 hours',
    welcomeBonusCoins: 1000,
    messageCost: 10,
    maxGiftQuantity: 100, // most of one gift a user can send in a single go (app offers ×1/×10/×50/×100)
    newUserCoins: 50, // bonus coins for every new account
    minLiveBalance: 50, // coins a user must hold to enter a host's live
  },
  coinPacks: [
    { id: 'p1', coins: 100, bonus: 0, price: 99, tag: '', active: true, firstRecharge: false },
    { id: 'p2', coins: 500, bonus: 50, price: 449, tag: 'Popular', active: true, firstRecharge: false },
    { id: 'p3', coins: 1200, bonus: 200, price: 999, tag: '', active: true, firstRecharge: false },
    { id: 'p4', coins: 2500, bonus: 500, price: 1999, tag: 'Best value', active: true, firstRecharge: false },
    { id: 'p5', coins: 6000, bonus: 1500, price: 4499, tag: '', active: true, firstRecharge: false },
    { id: 'p6', coins: 15000, bonus: 5000, price: 9999, tag: '', active: true, firstRecharge: false },
    { id: 'p7', coins: 300, bonus: 300, price: 99, tag: 'First recharge', active: true, firstRecharge: true },
    // Big packs for Royal gifts, kept at ₹0.50 a coin (hosts receive ₹0.40 per gift coin).
    { id: 'p8', coins: 50000, bonus: 0, price: 24999, tag: 'Gold chest', active: true, firstRecharge: false },
    { id: 'p9', coins: 100000, bonus: 0, price: 49999, tag: 'Platinum chest', active: true, firstRecharge: false },
    { id: 'p10', coins: 200000, bonus: 0, price: 99999, tag: 'Royal treasury', active: true, firstRecharge: false },
  ],
  // category = the gift panel tab: Popular · Love · Premium · Luxury · Royal · Festival.
  // Festival gifts show only while settings.features.festivalGifts is on.
  gifts: [
    ['lollipop', 'Lollipop', '🍭', 10, 'Popular'],
    ['candy', 'Sweet Candy', '🍬', 10, 'Popular'],
    ['bow', 'Pretty Bow', '🎀', 15, 'Popular'],
    ['star', 'Shining Star', '⭐', 15, 'Popular'],
    ['heart', 'Love Heart', '❤️', 20, 'Popular'],
    ['letter', 'Love Note', '💌', 25, 'Popular'],
    ['teddy', 'Teddy Hug', '🧸', 35, 'Popular'],
    ['rose', 'Red Rose', '🌹', 40, 'Popular'],
    ['cupcake', 'Cupcake', '🧁', 45, 'Popular'],
    ['butterfly', 'Butterfly', '🦋', 50, 'Popular'],
    ['balloons', 'Love Balloons', '🎈', 60, 'Popular'],
    ['dove', 'Love Dove', '🕊️', 70, 'Popular'],
    ['tulip', 'Tulips', '🌷', 80, 'Popular'],
    ['coffee', 'Coffee Date', '☕', 90, 'Popular'],
    ['heartbox', 'Heart Chocolates', '💝', 100, 'Love'],
    ['bouquet', 'Bouquet', '💐', 125, 'Love'],
    ['lipstick', 'Lipstick', '💄', 150, 'Love'],
    ['perfume', 'Perfume', '🧴', 175, 'Love'],
    ['handbag', 'Handbag', '👜', 200, 'Love'],
    ['shades', 'Cool Shades', '🕶️', 250, 'Love'],
    ['chocolate', 'Chocolate Box', '🍫', 300, 'Love'],
    ['icecream', 'Ice Cream', '🍦', 350, 'Love'],
    ['heels', 'High Heels', '👠', 500, 'Premium'],
    ['watch', 'Smart Watch', '⌚', 800, 'Premium'],
    ['cake', 'Party Cake', '🎂', 1000, 'Premium'],
    ['champagne', 'Champagne', '🍾', 1200, 'Premium'],
    ['sunflower', 'Sunflower', '🌻', 1350, 'Premium'],
    ['goldcoin', 'Gold Coins', '🪙', 1500, 'Premium'],
    ['trophy', 'Trophy', '🏆', 1800, 'Premium'],
    ['giftbox', 'Surprise Box', '🎁', 2000, 'Premium'],
    ['dress', 'Party Dress', '👗', 2500, 'Luxury'],
    ['ring', 'Diamond Ring', '💍', 5000, 'Luxury'],
    ['diamond', 'Big Diamond', '💎', 6000, 'Luxury'],
    ['crown', 'Queen’s Crown', '👑', 8000, 'Luxury'],
    ['unicorn', 'Unicorn', '🦄', 10000, 'Luxury'],
    ['island', 'Island Getaway', '🏝️', 12000, 'Luxury'],
    ['castle', 'Fairy Castle', '🏰', 15000, 'Luxury'],
    ['car', 'Supercar', '🏎️', 18000, 'Luxury'],
    ['yacht', 'Yacht', '🛥️', 20000, 'Luxury'],
    ['airballoon', 'Hot Air Balloon', '🎈', 25000, 'Royal'],
    ['jet', 'Private Jet', '✈️', 35000, 'Royal'],
    ['cruise', 'Cruise Ship', '🚢', 50000, 'Royal'],
    ['rocket', 'Rocket', '🚀', 60000, 'Royal'],
    ['chest', 'Treasure Chest', '💰', 70000, 'Royal'],
    ['moon', 'Chand Sitara', '🌙', 75000, 'Royal'],
    ['ufo', 'Space Saucer', '🛸', 90000, 'Royal'],
    ['planet', 'Own a Planet', '🪐', 100000, 'Royal'],
    ['palace', 'Royal Palace', '🏛️', 150000, 'Royal'],
    ['shootingstar', 'Wish Upon a Star', '🌠', 200000, 'Royal'],
    ['firecracker', 'Firecracker', '🧨', 10, 'Festival'],
    ['sparkler', 'Phuljhadi', '🎇', 25, 'Festival'],
    ['diya', 'Diya', '🪔', 50, 'Festival'],
    ['lotus', 'Lotus', '🪷', 100, 'Festival'],
    ['lantern', 'Akash Kandil', '🏮', 175, 'Festival'],
    ['bell', 'Temple Bell', '🔔', 450, 'Festival'],
    ['tabla', 'Tabla', '🥁', 750, 'Festival'],
    ['fireworks', 'Fireworks', '🎆', 1250, 'Festival'],
    ['peacock', 'Mor Pankh', '🦚', 5500, 'Festival'],
    ['diwalinight', 'Diwali Night', '🪔', 15000, 'Festival'],
  ].map(([key, name, emoji, coins, category], i) => ({
    key,
    name,
    emoji,
    coins,
    // Realistic 3D gift rendered for REBU: a picture for the gift panel and a Lottie
    // animation (frames + effects) played over the call/live. Admins can swap either.
    image: `/static/gifts/thumbs/${key}.webp`,
    animation: `/static/gifts/${key}.json`,
    fullScreen: coins >= 500,
    category,
    active: true,
    order: i + 1,
  })),
  // Host levels come from lifetime gift coins received. Each level belongs to a
  // category (Iron…Diamond) that sets the price cap and commission discount.
  hostCategories: HOST_CATEGORIES,
  hostLevels: HOST_LEVELS,
  rateTiers: {
    video: [30, 40, 60, 80, 100, 150, 200, 300],
    voice: [15, 20, 30, 40, 60, 80, 100, 150],
  },
  vipTiers: [
    { level: 1, name: 'VIP 1', price: 199, days: 30, active: true, perks: ['VIP badge', '5% off calls', '20 bonus coins / day'] },
    { level: 2, name: 'VIP 2', price: 499, days: 30, active: true, perks: ['VIP badge', '10% off calls', '50 bonus coins / day', 'Exclusive chat bubble'] },
    { level: 3, name: 'VIP 3', price: 999, days: 30, active: true, perks: ['Everything in VIP 2', '15% off calls', 'Entry effect in rooms', 'Priority in Spark'] },
    { level: 4, name: 'VIP Elite', price: 2499, days: 30, active: true, perks: ['Everything in VIP 3', '20% off calls', '200 bonus coins / day', 'Hidden visitor mode', 'Dedicated support'] },
  ],
  royalClub: [
    { key: 'silver', name: 'Silver Crown', emoji: '🥈', price: 4999, active: true, coinsBack: 300, perks: ['Crown badge on profile', 'Room entry banner', '300 coins back'] },
    { key: 'gold', name: 'Gold Crown', emoji: '🥇', price: 9999, active: true, coinsBack: 800, perks: ['Everything in Silver', 'Exclusive avatar frame', 'Mic priority in rooms', '800 coins back'] },
    { key: 'platinum', name: 'Platinum Crown', emoji: '🏰', price: 24999, active: true, coinsBack: 2500, perks: ['Everything in Gold', 'Animated entry effect', 'Anti-kick in rooms', '2,500 coins back'] },
    { key: 'diamond', name: 'Diamond Crown', emoji: '👑', price: 49999, active: true, coinsBack: 6000, perks: ['Everything in Platinum', 'Global entrance announcement', 'Custom room theme', '6,000 coins back'] },
  ],
  // Avatar frames, room entry effects and chat bubbles, bought with coins for a number of days.
  storeItems: [
    { id: 's1', category: 'frame', name: 'Rose Frame', emoji: '🌹', price: 299, days: 7, active: true },
    { id: 's2', category: 'frame', name: 'Royal Frame', emoji: '👑', price: 999, days: 7, active: true },
    { id: 's3', category: 'frame', name: 'Neon Heart', emoji: '💗', price: 499, days: 7, active: true },
    { id: 's4', category: 'entry', name: 'Sports Car Entry', emoji: '🏎️', price: 1499, days: 7, active: true },
    { id: 's5', category: 'entry', name: 'Fireworks Entry', emoji: '🎆', price: 799, days: 7, active: true },
    { id: 's6', category: 'entry', name: 'Rocket Entry', emoji: '🚀', price: 1999, days: 7, active: true },
    { id: 's7', category: 'bubble', name: 'Candy Bubble', emoji: '🍬', price: 199, days: 7, active: true },
    { id: 's8', category: 'bubble', name: 'Galaxy Bubble', emoji: '🌌', price: 399, days: 7, active: true },
  ],
  // Task rewards. metric = what the server counts (see social/tasks.js).
  // Users get coins; hosts get the reward as a bonus earning (coins × coinInr).
  tasks: {
    user: [
      { id: 'checkin', group: 'Daily', title: 'Check in today', metric: 'checkin', goal: 1, reward: 10, active: true },
      { id: 'video_call', group: 'Daily', title: 'Make a video call', metric: 'video_calls', goal: 1, reward: 20, active: true },
      { id: 'greet3', group: 'Daily', title: 'Say Hi to 3 hosts', metric: 'greetings', goal: 3, reward: 15, active: true },
      { id: 'gift1', group: 'Daily', title: 'Send a gift', metric: 'gifts_sent', goal: 1, reward: 15, active: true },
      { id: 'profile', group: 'Newbie', title: 'Complete your profile', metric: 'profile', goal: 1, reward: 50, active: true },
      { id: 'follow5', group: 'Newbie', title: 'Follow 5 hosts', metric: 'following', goal: 5, reward: 30, active: true },
      { id: 'recharge', group: 'Newbie', title: 'Make your first recharge', metric: 'recharged', goal: 1, reward: 100, active: true },
    ],
    host: [
      { id: 'h_calls', group: 'Daily', title: 'Answer 3 calls', metric: 'calls_answered', goal: 3, reward: 50, active: true },
      { id: 'h_live', group: 'Daily', title: 'Go live for 10 minutes', metric: 'live_minutes', goal: 10, reward: 80, active: true },
      { id: 'h_earn', group: 'Daily', title: 'Earn ₹200 today', metric: 'earned_inr', goal: 200, reward: 100, active: true },
    ],
  },
  families: { createCost: 1000, joinReward: 50, maxMembers: 300, levelCoins: [0, 10000, 50000, 200000, 1000000, 5000000] },
  diamondsPerCoin: 2, // non-host users receive gifts in rooms as diamonds and swap them for coins
  settings: {
    maintenance: false,
    maintenanceMessage: 'REBU is getting an upgrade. We’ll be back shortly.',
    minVersion: { android: '1.3.0', ios: '1.3.0' },
    latestVersion: { android: '1.3.0', ios: '1.3.0' },
    forceUpdate: false,
    login: { phone: true, google: true, apple: true, facebook: false, email: true },
    otp: { provider: 'MSG91', length: 6, expirySecs: 300, resendSecs: 30 },
    features: {
      festivalGifts: true,
      randomCall: true,
      goLive: true,
      premiumLive: true,
      rooms: true,
      moments: true,
      gifts: true,
      chat: true,
      screenshotBlock: true,
      hostApplications: true,
      agencies: true,
    },
    hostApply: { minAge: 18, womenOnly: true, liveWomenOnly: true, autoApprove: false, requireSelfie: true, requireId: true, idTypes: ['Aadhaar', 'PAN', 'Passport', 'Driving licence'] },
    moderation: {
      autoFlagKeywords: ['whatsapp', 'paytm me', 'nude', 'number do', 'telegram'],
      blockContactSharing: true,
      maxReportsBeforeAutoSuspend: 10,
      liveRecordingForReview: true,
    },
    limits: { maxGuestsInLive: 2, maxRoomSeats: 8, ringTimeoutSecs: 30, freeMessagesPerDay: 0, maxCallsAtOnce: 2 },
    support: { email: 'support@rebu.app', whatsapp: '', hours: '10 AM – 10 PM IST' },
  },
}

export const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG)
