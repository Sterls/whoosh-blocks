import { test } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const store = await import('../js/storage.js');

test('a brand-new player starts with sound and vibration on, and the automatic theme', () => {
  mem.clear();
  const s = store.load();
  assert.equal(s.sound, true);
  assert.equal(s.vibrate, true);
  assert.equal(s.theme, 'auto');
  assert.equal(s.unlocked, 1);
});

test('resetting progress keeps the nickname, player id and theme', () => {
  mem.clear();
  const s = { ...store.load(), name: 'Mum', theme: 'dark', unlocked: 30 };
  const fresh = store.reset(s);
  assert.equal(fresh.name, 'Mum');
  assert.equal(fresh.playerId, s.playerId);
  assert.equal(fresh.theme, 'dark');
  assert.equal(fresh.unlocked, 1);
});
