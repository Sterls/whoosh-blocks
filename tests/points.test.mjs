import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelPoints, targetSeconds, totalPoints, POINTS_PER_CUBE } from '../js/points.js';
import { cubeCount } from '../js/levels.js';

test('bigger levels are worth more, faster is worth more, bumps cost points', () => {
  const t = targetSeconds(50); // 105s
  assert.equal(levelPoints(50, t, 0).total, 500); // on target: base only
  assert.equal(levelPoints(50, 0, 0).total, 1000); // instant: double
  assert.ok(levelPoints(50, 30, 0).total > levelPoints(50, 60, 0).total);
  assert.equal(levelPoints(50, t, 2).total, 460);
  assert.ok(levelPoints(80, t, 0).total > levelPoints(50, t, 0).total);
});

test('a clear is always worth at least 10% of the base', () => {
  assert.equal(levelPoints(10, 999, 50).total, 10);
});

test('total sums the best score per beaten level, crediting older clears at base', () => {
  const save = { unlocked: 4, points: { 2: 999 } };
  const expected = POINTS_PER_CUBE * cubeCount(1) + 999 + POINTS_PER_CUBE * cubeCount(3);
  assert.equal(totalPoints(save), expected);
  assert.equal(totalPoints({ unlocked: 1, points: {} }), 0);
});
