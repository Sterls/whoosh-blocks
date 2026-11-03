import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLevel, challengeType } from '../js/levels.js';
import { DIFFICULTIES, newRoomCode, roomFromUrl, pickLevels, totalCubes, standings } from '../js/race.js';

test('race levels are distinct, in range, not trophy levels, and build up in size', () => {
  for (const diff of Object.keys(DIFFICULTIES)) {
    for (const count of [3, 5]) {
      const levels = pickLevels(diff, count);
      assert.equal(levels.length, count);
      assert.equal(new Set(levels).size, count);
      for (const n of levels) {
        assert.ok(n >= DIFFICULTIES[diff].from && n <= DIFFICULTIES[diff].to);
        assert.equal(challengeType(n), null);
      }
      const sizes = levels.map((n) => getLevel(n).cubes.length);
      assert.deepEqual(sizes, [...sizes].sort((a, b) => a - b));
      assert.equal(totalCubes(levels), sizes.reduce((a, b) => a + b, 0));
    }
  }
});

test('room codes are easy to read and type', () => {
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(), /^[A-HJKMNP-Z2-9]{5}$/);
  assert.equal(roomFromUrl('?race=wh5k2'), 'WH5K2');
  assert.equal(roomFromUrl('?race=<b>'), null);
});

test('standings: finishers by score, then racers by progress, then players who left', () => {
  const rows = standings([
    { id: 'a', cleared: 40 },
    { id: 'b', time_ms: 90000, bumps: 0 },
    { id: 'c', cleared: 70 },
    { id: 'd', time_ms: 80000, bumps: 3 }, // 95s with bumps
    { id: 'e', cleared: 90, gone: true },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['b', 'd', 'c', 'a', 'e']);
});
