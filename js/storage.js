// Progress and settings, saved on the phone only.

const KEY = 'whoosh-blocks-save-v1';
// Early test versions saved under this key. Safe to delete once players have updated.
const OLD_KEY = 'cube-away-save-v1';

const defaults = () => ({
  unlocked: 1, stars: {}, trophies: {}, sound: true, vibrate: true, seenHelp: false,
  name: '', playerId: '', // leaderboard identity
});

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function load() {
  let data;
  try {
    const old = localStorage.getItem(OLD_KEY);
    if (old && !localStorage.getItem(KEY)) localStorage.setItem(KEY, old);
    if (old) localStorage.removeItem(OLD_KEY);
    const raw = localStorage.getItem(KEY);
    data = raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    data = defaults();
  }
  if (!data.playerId) {
    data.playerId = newId();
    save(data);
  }
  return data;
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the game still works, it just won't remember.
  }
}

// Start the levels over, but keep the leaderboard name and id.
export function reset(old) {
  const fresh = { ...defaults(), name: old.name, playerId: old.playerId };
  save(fresh);
  return fresh;
}
