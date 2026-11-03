// The live connection for races: who is in a room ("presence") and quick
// race messages between the phones ("broadcast"), using Supabase Realtime.
// Nothing is stored; a room disappears when everyone leaves.
//
// With `localrace` in the page address, a BroadcastChannel stands in for
// Supabase so races can be tested in several tabs of one browser.

import { LEADERBOARD } from './config.js';

let clientPromise = null;

// The Supabase library is only downloaded when someone opens a race.
function loadClient() {
  if (!clientPromise) {
    clientPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/supabase.js';
      script.onload = () => resolve(window.supabase.createClient(LEADERBOARD.url, LEADERBOARD.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }));
      script.onerror = () => {
        clientPromise = null;
        reject(new Error('Could not load the race connection'));
      };
      document.head.appendChild(script);
    });
  }
  return clientPromise;
}

// Join room `code` as `me` ({ id, name, host }).
// handlers.onPlayers(list) runs whenever someone joins, leaves or updates;
// handlers.onMessage(type, data, fromId) for race messages from others.
// Resolves with { send(type, data), update(fields), leave() }.
export async function joinRoom(code, me, handlers) {
  if (location.search.includes('localrace')) return localRoom(code, me, handlers);
  const client = await loadClient();
  const channel = client.channel(`race-${code}`, {
    config: { broadcast: { self: false }, presence: { key: me.id } },
  });
  let mine = { ...me, joinedAt: Date.now() };
  const players = () => Object.values(channel.presenceState()).map((metas) => metas[0]);
  channel.on('presence', { event: 'sync' }, () => handlers.onPlayers(players()));
  channel.on('broadcast', { event: 'msg' }, ({ payload }) => handlers.onMessage(payload.type, payload.data, payload.from));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('The race connection timed out')), 12000);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        await channel.track(mine);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Race connection failed (${status})`));
      }
    });
  });
  return {
    send: (type, data) => channel.send({ type: 'broadcast', event: 'msg', payload: { type, data, from: me.id } }),
    update: (fields) => { mine = { ...mine, ...fields }; return channel.track(mine); },
    leave: () => client.removeChannel(channel),
  };
}

function localRoom(code, me, handlers) {
  const bc = new BroadcastChannel(`race-${code}`);
  const peers = new Map(); // id -> { info, seen }
  let mine = { ...me, joinedAt: Date.now() };
  const emit = () => handlers.onPlayers([mine, ...[...peers.values()].map((p) => p.info)]);
  const announce = (kind = 'here') => bc.postMessage({ kind, info: mine });
  bc.onmessage = ({ data }) => {
    if (data.kind === 'here' || data.kind === 'hello') {
      peers.set(data.info.id, { info: data.info, seen: Date.now() });
      if (data.kind === 'hello') announce();
      emit();
    } else if (data.kind === 'bye') {
      peers.delete(data.id);
      emit();
    } else if (data.kind === 'msg') {
      handlers.onMessage(data.type, data.data, data.from);
    }
  };
  announce('hello');
  emit();
  const heartbeat = setInterval(() => {
    announce();
    for (const [id, p] of peers) if (Date.now() - p.seen > 4000) peers.delete(id);
    emit();
  }, 1500);
  return Promise.resolve({
    send: (type, data) => bc.postMessage({ kind: 'msg', type, data, from: me.id }),
    update: (fields) => { mine = { ...mine, ...fields }; announce(); emit(); },
    leave: () => { clearInterval(heartbeat); bc.postMessage({ kind: 'bye', id: me.id }); bc.close(); },
  });
}
