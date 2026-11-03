// Friend challenges ("duels"): two players race the same puzzle at different
// times. Lowest score wins, where score = time + 5 seconds per bump.

export const BUMP_PENALTY_MS = 5000;

export const duelScore = (r) => r.time_ms + BUMP_PENALTY_MS * r.bumps;

// 58.3s, 1:12.4
export function formatMs(ms) {
  const tenths = Math.round(ms / 100);
  const s = tenths / 10;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}

// "1:12.4, no bumps" / "58.3s + 2 bumps"
export function describe(r) {
  const bumps = r.bumps === 0 ? ', no bumps' : ` + ${r.bumps} bump${r.bumps === 1 ? '' : 's'}`;
  return formatMs(r.time_ms) + bumps;
}

// Who won, from my point of view: 'win', 'lose' or 'tie'.
export function outcome(mine, theirs) {
  const a = duelScore(mine), b = duelScore(theirs);
  return a < b ? 'win' : a > b ? 'lose' : 'tie';
}

// Challenge codes are 6 characters (letters and digits) in the link's ?c= part.
export function codeFromUrl(search) {
  const code = new URLSearchParams(search).get('c');
  return code && /^[0-9A-Za-z]{6}$/.test(code) ? code.toUpperCase() : null;
}

export function duelLink(code) {
  return `${location.origin}${location.pathname}?c=${code}`;
}
