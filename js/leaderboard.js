// Shared leaderboard, stored in a Supabase database (see supabase/setup.sql).

import { LEADERBOARD } from './config.js';

export function isConfigured() {
  return Boolean(LEADERBOARD.url && LEADERBOARD.anonKey);
}

async function request(path, options = {}) {
  const res = await fetch(LEADERBOARD.url.replace(/\/$/, '') + path, {
    ...options,
    headers: {
      apikey: LEADERBOARD.anonKey,
      Authorization: `Bearer ${LEADERBOARD.anonKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Leaderboard request failed (${res.status})`);
  return res;
}

// Top players, best first: [{ name, level }]
export async function fetchTop(limit = 50) {
  const res = await request(`/rest/v1/leaderboard?select=name,level&limit=${limit}`);
  return res.json();
}

// Record this phone's furthest level. Never lowers an existing score.
export async function submit(secret, name, level) {
  await request('/rest/v1/rpc/submit_score', {
    method: 'POST',
    body: JSON.stringify({ p_secret: secret, p_name: name, p_level: level }),
  });
}
