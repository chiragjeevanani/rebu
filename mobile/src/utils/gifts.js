/** '🌹 Rose' or '🌹 Rose ×10' when several were sent together. */
export const giftText = g =>
  `${g?.emoji || '🎁'} ${g?.name || 'Gift'}${g?.count > 1 ? ` ×${g.count}` : ''}`;
