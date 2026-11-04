// Shared leaderboard, stored in a Supabase database (see supabase/setup.sql).

import { LEADERBOARD } from './config.js';

export function isConfigured() {
  return Boolean(LEADERBOARD.url && LEADERBOARD.anonKey);
}

async function request(path, options = {}) {
  const headers = { apikey: LEADERBOARD.anonKey, 'Content-Type': 'application/json' };
  // Older "anon" keys are JWTs and also go in Authorization; newer
  // "publishable" keys must only be sent as apikey.
  if (LEADERBOARD.anonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${LEADERBOARD.anonKey}`;
  const res = await fetch(LEADERBOARD.url.replace(/\/$/, '') + path, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!res.ok) {
    let message = '';
    try { message = (await res.json()).message || ''; } catch { /* not JSON */ }
    const err = new Error(message || `Leaderboard request failed (${res.status})`);
    err.nameRejected = message === 'name not allowed';
    throw err;
  }
  return res;
}

const rpc = (fn, args) => request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// Top players, most points first: [{ name, level, points }]
export async function fetchTop(limit = 50) {
  const res = await request(`/rest/v1/leaderboard?select=name,level,points&limit=${limit}`);
  return res.json();
}

// Record this phone's furthest level and total points. Never lowers a score.
export async function submit(secret, name, level, points) {
  await rpc('submit_score', { p_secret: secret, p_name: name, p_level: level, p_points: points });
}

// Flag a nickname as inappropriate. Three reports from different players hide it.
export async function report(reporterSecret, name) {
  await rpc('report_name', { p_reporter: reporterSecret, p_name: name });
}

// Delete this phone's entry from the leaderboard.
export async function remove(secret) {
  await rpc('delete_score', { p_secret: secret });
}

// ---------- friend challenges ----------

// Create a challenge from this player's result. Returns { code, name, level, time_ms, bumps, results }.
export async function createDuel(secret, name, level, timeMs, bumps) {
  const res = await rpc('create_duel', { p_secret: secret, p_name: name, p_level: level, p_time_ms: timeMs, p_bumps: bumps });
  return res.json();
}

// A challenge and everyone's results, or null if it doesn't exist or has expired.
export async function getDuel(code) {
  const res = await rpc('get_duel', { p_code: code });
  return res.json();
}

// Record a friend's attempt (their best is kept). Returns the updated challenge.
export async function submitDuelResult(code, secret, name, timeMs, bumps) {
  const res = await rpc('submit_duel_result', { p_code: code, p_secret: secret, p_name: name, p_time_ms: timeMs, p_bumps: bumps });
  return res.json();
}
