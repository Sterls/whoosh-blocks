import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLevel, blockerDistance, boundsOf, key, challengeType, PICTURE_COUNT } from '../js/levels.js';

// Greedy solver: removing a cube never blocks another, so if the level is
// solvable, repeatedly removing any free cube must clear it.
function solve(cubes) {
  const bounds = boundsOf(cubes);
  const left = new Map(cubes.map((c) => [key(c[0], c[1], c[2]), c]));
  let progress = true;
  while (left.size && progress) {
    progress = false;
    for (const [k, c] of left) {
      if (blockerDistance(left, c, bounds) === 0) { left.delete(k); progress = true; }
    }
  }
  return left.size === 0;
}

test('levels 1-300 are solvable, unique-celled and deterministic', () => {
  for (let n = 1; n <= 300; n++) {
    const lvl = getLevel(n);
    assert.ok(lvl.cubes.length >= 3, `level ${n} too small`);
    const keys = new Set(lvl.cubes.map((c) => key(c[0], c[1], c[2])));
    assert.equal(keys.size, lvl.cubes.length, `level ${n} has overlapping cubes`);
    assert.ok(solve(lvl.cubes), `level ${n} is not solvable`);
    assert.deepEqual(getLevel(n), lvl);
  }
});

test('levels have some cubes that start blocked', () => {
  for (let n = 10; n <= 100; n++) {
    const cubes = getLevel(n).cubes;
    const bounds = boundsOf(cubes);
    const all = new Set(cubes.map((c) => key(c[0], c[1], c[2])));
    const blocked = cubes.filter((c) => blockerDistance(all, c, bounds) > 0).length;
    assert.ok(blocked > 0, `level ${n} has no blocked cubes`);
  }
});

test('levels keep generating far beyond the first few hundred', () => {
  for (const n of [500, 1000, 5000, 12345, 99999, 1000000]) {
    const lvl = getLevel(n);
    assert.ok(lvl.cubes.length >= 4, `level ${n} too small`);
    assert.ok(solve(lvl.cubes), `level ${n} is not solvable`);
  }
});

test('challenges come every 5 levels from level 5, rotating through four types', () => {
  assert.equal(challengeType(4), null);
  assert.equal(challengeType(6), null);
  assert.deepEqual([5, 10, 15, 20, 25].map(challengeType), ['picture', 'perfect', 'speed', 'taps', 'picture']);
  for (let n = 1; n <= 400; n++) assert.equal(getLevel(n).challenge ?? null, challengeType(n));
});

test('challenge levels are solvable and carry their goals', () => {
  const pictures = new Set();
  for (let n = 5; n <= 5 * 4 * PICTURE_COUNT; n += 5) {
    const lvl = getLevel(n);
    assert.ok(solve(lvl.cubes), `challenge level ${n} is not solvable`);
    if (lvl.challenge === 'picture') {
      pictures.add(lvl.picture);
      assert.ok(lvl.cubes.every((c) => typeof c[4] === 'string'), `picture level ${n} is missing colours`);
    } else {
      assert.ok(lvl.cubes.length <= 125, `challenge level ${n} is too big`);
    }
    if (lvl.challenge === 'speed') assert.ok(lvl.targetSeconds >= lvl.cubes.length, `level ${n} target too tight`);
    if (lvl.challenge === 'taps') assert.ok(lvl.tapLimit > lvl.cubes.length, `level ${n} tap limit too tight`);
  }
  assert.equal(pictures.size, PICTURE_COUNT, 'every picture should appear once per cycle');
});
