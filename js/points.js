// Points for the leaderboard. Each level is worth 10 points per cube.
// Finishing faster than the level's target time adds a speed bonus of up to
// the same again, and each bump costs 20 points. A clear is always worth at
// least 10% of the base. A player's total is the sum of their best score on
// every level they've beaten, so replaying a level faster raises it.

import { cubeCount } from './levels.js';

export const POINTS_PER_CUBE = 10;
export const BUMP_PENALTY = 20;

// Seconds to finish a level for no speed bonus: 2 per cube, plus 5.
export const targetSeconds = (cubes) => cubes * 2 + 5;

export function levelPoints(cubes, seconds, bumps) {
  const base = POINTS_PER_CUBE * cubes;
  const target = targetSeconds(cubes);
  const speed = Math.round(base * Math.max(0, Math.min(1, (target - seconds) / target)));
  const penalty = BUMP_PENALTY * bumps;
  const total = Math.max(Math.round(base * 0.1), base + speed - penalty);
  return { base, speed, penalty, total };
}

// What a beaten level counts for in the total: the best score recorded, or
// its base points if it was beaten before points were added to the game.
export const levelBest = (save, n) => save.points?.[n] ?? POINTS_PER_CUBE * cubeCount(n);

export function totalPoints(save) {
  let sum = 0;
  for (let n = 1; n < save.unlocked; n++) sum += levelBest(save, n);
  return sum;
}
