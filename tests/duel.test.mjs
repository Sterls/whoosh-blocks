import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duelScore, formatMs, describe, outcome, codeFromUrl } from '../js/duel.js';

test('score is time plus 5 seconds per bump', () => {
  assert.equal(duelScore({ time_ms: 60000, bumps: 0 }), 60000);
  assert.equal(duelScore({ time_ms: 60000, bumps: 2 }), 70000);
});

test('who wins', () => {
  const fast = { time_ms: 50000, bumps: 2 }; // 60s
  const clean = { time_ms: 58000, bumps: 0 }; // 58s
  assert.equal(outcome(clean, fast), 'win');
  assert.equal(outcome(fast, clean), 'lose');
  assert.equal(outcome(clean, { time_ms: 53000, bumps: 1 }), 'tie');
});

test('times and results read naturally', () => {
  assert.equal(formatMs(58349), '58.3s');
  assert.equal(formatMs(72400), '1:12.4');
  assert.equal(formatMs(60000), '1:00.0');
  assert.equal(describe({ time_ms: 72400, bumps: 0 }), '1:12.4, no bumps');
  assert.equal(describe({ time_ms: 58300, bumps: 1 }), '58.3s + 1 bump');
});

test('challenge codes are read safely from links', () => {
  assert.equal(codeFromUrl('?c=2b214a'), '2B214A');
  assert.equal(codeFromUrl('?c=<script>'), null);
  assert.equal(codeFromUrl('?debug'), null);
});
