// Live races: up to 8 friends play the same series of levels at the same
// time. Everyone moves through the series at their own pace; the lowest
// total time + 5 seconds per bump wins. Later levels are bigger, so there's
// room to catch up.

import { getLevel, challengeType } from './levels.js';
import { duelScore } from './duel.js';

export const MAX_PLAYERS = 8;

export const DIFFICULTIES = {
  easy: { label: 'Easy', from: 6, to: 19 },
  medium: { label: 'Medium', from: 21, to: 49 },
  hard: { label: 'Hard', from: 51, to: 99 },
};

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L mix-ups

export function newRoomCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)];
  return code;
}

export function roomFromUrl(search) {
  const code = new URLSearchParams(search).get('race');
  return code && /^[A-Za-z0-9]{5}$/.test(code) ? code.toUpperCase() : null;
}

// Pick `count` different levels in the difficulty's range, smallest first, so
// the race builds up to its biggest level. Trophy-challenge levels are skipped.
export function pickLevels(difficulty, count, random = Math.random) {
  const { from, to } = DIFFICULTIES[difficulty];
  const pool = [];
  for (let n = from; n <= to; n++) if (!challengeType(n)) pool.push(n);
  const chosen = [];
  while (chosen.length < count && pool.length) chosen.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return chosen.sort((a, b) => getLevel(a).cubes.length - getLevel(b).cubes.length);
}

export function totalCubes(levels) {
  return levels.reduce((sum, n) => sum + getLevel(n).cubes.length, 0);
}

// Order players for the live board and the results: finished players by
// score, then everyone still racing by how far along they are, then players
// who gave up or left.
export function standings(players) {
  const rank = (p) => (p.time_ms != null ? 0 : p.gone ? 2 : 1);
  return [...players].sort((a, b) =>
    rank(a) - rank(b)
    || (rank(a) === 0 ? duelScore(a) - duelScore(b) : (b.cleared || 0) - (a.cleared || 0)));
}
