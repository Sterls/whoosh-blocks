// App shell: screens, saving progress, sounds, and the Android back button.

import { Game } from './game.js';
import { getLevel, challengeType } from './levels.js';
import * as store from './storage.js';
import { play, unlockAudio, setSoundEnabled } from './audio.js';
import * as board from './leaderboard.js';
import { nameProblem } from './names.js';
import { confetti } from './confetti.js';
import { duelScore, formatMs, describe, outcome, codeFromUrl, duelLink } from './duel.js';
import { MAX_PLAYERS, newRoomCode, roomFromUrl, pickLevels, totalCubes, standings } from './race.js';
import { joinRoom } from './race-net.js';

const $ = (id) => document.getElementById(id);
// Wire a control if it exists, so one missing element can't stop the others working.
const on = (id, type, fn) => $(id)?.addEventListener(type, fn);
let save = store.load();
setSoundEnabled(save.sound);

let game;
let currentLevel = 1;
let current = null; // the level being played
let helpTimer = null;
let waitingWorker = null; // a downloaded new version, waiting for the player to tap Update
let duel = null; // the friend's challenge being played, if any
let lastResult = null; // { level, time_ms, bumps } of the last normal win, for challenging friends

function vibrate(pattern) {
  if (!save.vibrate) return;
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

function starsFor(mistakes) {
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const CHALLENGES = {
  picture: {
    goal: (l) => `🏆 Picture: ${l.picture}`,
    intro: (l) => `<b>Picture challenge!</b><br>Clear the ${l.picture.toLowerCase()} to win a trophy.`,
  },
  perfect: {
    goal: () => '🏆 Perfect run · no bumps',
    intro: () => '<b>Perfect run!</b><br>Clear it without a single bump.<br>A bump starts the level over.',
  },
  speed: {
    goal: (l) => `⏱ ${formatTime(game.elapsed)} / ${formatTime(l.targetSeconds)}`,
    intro: (l) => `<b>Speed bonus!</b><br>Finish within ${formatTime(l.targetSeconds)} for a trophy.<br>The clock starts on your first tap.`,
    over: (l) => game.elapsed > l.targetSeconds,
  },
  taps: {
    goal: (l) => `👆 ${game.taps} / ${l.tapLimit} taps`,
    intro: (l) => `<b>Tap bonus!</b><br>Finish in ${l.tapLimit} taps or fewer for a trophy.`,
    over: (l) => game.taps > l.tapLimit,
  },
};

const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
const LOCK_SVG = '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// ---------- screens ----------

function show(screen) {
  for (const id of ['home', 'levels', 'board', 'duels', 'race', 'hud', 'win', 'settings', 'duel-modal', 'name-modal']) $(id)?.classList.add('hidden');
  const racing = Boolean(race?.playing) && screen === 'game';
  $('race-board').classList.toggle('hidden', !racing);
  $('race-cheers').classList.toggle('hidden', !racing);
  $('hud-mistakes').classList.toggle('hidden', racing);
  $('restart-btn').style.visibility = racing ? 'hidden' : ''; // restarting would drop you out of the race
  $('hud').classList.toggle('racing', racing);
  game?.setActive(screen === 'game');
  // Offer updates from the menus, never in the middle of a level.
  $('update-bar').classList.toggle('hidden', !waitingWorker || screen === 'game');
  if (screen === 'home') {
    $('home').classList.remove('hidden');
    $('play-btn').textContent = save.unlocked > 1 ? `Play · Level ${save.unlocked}` : 'Play';
    const trophies = Object.keys(save.trophies).length;
    $('trophy-count').textContent = `🏆 ${trophies} ${trophies === 1 ? 'trophy' : 'trophies'}`;
    $('trophy-count').classList.toggle('hidden', trophies === 0);
    $('board-btn').classList.toggle('hidden', !board.isConfigured());
    $('duels-btn').classList.toggle('hidden', !board.isConfigured());
    $('race-btn').classList.toggle('hidden', !board.isConfigured());
  } else if (screen === 'levels') {
    renderLevelGrid();
    $('levels').classList.remove('hidden');
  } else if (screen === 'board') {
    $('board').classList.remove('hidden');
    renderBoard();
  } else if (screen === 'race') {
    $('race').classList.remove('hidden');
    $('race-status').textContent = '';
    renderRaceScreen();
  } else if (screen === 'duels') {
    $('duels').classList.remove('hidden');
    renderDuels();
  } else if (screen === 'game') {
    $('hud').classList.remove('hidden');
  }
}

function go(screen, data = {}, replace = false) {
  const state = { screen, ...data };
  if (replace) history.replaceState(state, '');
  else history.pushState(state, '');
  route(state);
}

function route(state) {
  const screen = state?.screen || 'home';
  if (race) {
    const midRace = race.playing && !race.finished;
    if (midRace && screen !== 'race-game') {
      if (!confirm('Leave the race?')) {
        history.pushState({ screen: 'race-game' }, '');
        return;
      }
      leaveRace();
    } else if (!midRace && screen !== 'race' && screen !== 'race-game') {
      leaveRace();
    }
  }
  if (screen === 'race-game') return;
  if (screen === 'game') startLevel(state.level || save.unlocked, { duel: state.duel });
  else show(screen);
  if (state?.modal === 'settings') openSettings();
}

window.addEventListener('popstate', (e) => route(e.state));

function renderLevelGrid() {
  const grid = $('level-grid');
  const shown = Math.ceil((save.unlocked + 1) / 30) * 30;
  grid.innerHTML = '';
  for (let n = 1; n <= shown; n++) {
    const btn = document.createElement('button');
    btn.className = 'level-tile';
    if (n > save.unlocked) {
      btn.classList.add('locked');
      btn.innerHTML = LOCK_SVG;
      btn.disabled = true;
      btn.setAttribute('aria-label', `Level ${n}, locked`);
    } else {
      const stars = save.stars[n] || 0;
      if (n === save.unlocked) btn.classList.add('current');
      if (challengeType(n)) {
        const won = Boolean(save.trophies[n]);
        btn.classList.add('challenge');
        btn.innerHTML = `${n}<small class="${won ? '' : 'dim'}">🏆</small>`;
        btn.setAttribute('aria-label', `Level ${n}, challenge, ${won ? 'trophy won' : 'no trophy yet'}`);
      } else {
        btn.innerHTML = `${n}<small>${'★'.repeat(stars)}</small>`;
        btn.setAttribute('aria-label', `Level ${n}, ${stars} stars`);
      }
      btn.addEventListener('click', () => { play('click'); go('game', { level: n }); });
    }
    grid.appendChild(btn);
  }
  grid.querySelector('.current')?.scrollIntoView({ block: 'center' });
}

// ---------- leaderboard ----------

// The score is the furthest level beaten.
const bestLevel = () => save.unlocked - 1;

function submitScore() {
  if (!board.isConfigured() || !save.name) return Promise.resolve();
  return board.submit(save.playerId, save.name, bestLevel()).catch(() => {});
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

let shownRows = [];
const reported = new Set(); // nicknames reported during this visit

async function joinBoard(e) {
  e.preventDefault();
  const name = $('name-input').value.trim();
  const problem = nameProblem(name);
  $('name-error').textContent = problem;
  if (problem) return;
  play('click');
  try {
    await board.submit(save.playerId, name, bestLevel());
  } catch (err) {
    if (err.nameRejected) {
      $('name-error').textContent = 'Please choose a friendlier nickname.';
      return;
    }
    // Offline or similar: keep the name and send the score later.
  }
  save.name = name;
  store.save(save);
  $('name-input').blur();
  renderBoard();
}

async function reportRow(i) {
  const row = shownRows[i];
  if (!row || !confirm(`Report "${row.name}" as an inappropriate nickname?`)) return;
  try {
    await board.report(save.playerId, row.name);
    reported.add(row.name);
    renderBoard();
  } catch {
    alert("Couldn't send the report. Check your internet and try again.");
  }
}

async function removeMe() {
  if (!confirm('Remove your nickname and score from the leaderboard? Your progress in the game is kept.')) return;
  try {
    await board.remove(save.playerId);
  } catch {
    alert("Couldn't remove you right now. Check your internet and try again.");
    return;
  }
  save.name = '';
  store.save(save);
  renderBoard();
}

async function renderBoard({ askName = false } = {}) {
  const list = $('board-list'), status = $('board-status');
  const joining = askName || !save.name;
  list.innerHTML = '';
  $('board-me').classList.add('hidden');
  $('board-join').classList.add('hidden');

  if (!board.isConfigured()) {
    status.textContent = "The leaderboard isn't set up yet.";
    return;
  }
  if (joining) {
    status.textContent = '';
    $('name-error').textContent = '';
    $('name-input').value = save.name;
    $('board-join').classList.remove('hidden');
    return;
  }

  $('board-me-text').textContent = `You: ${save.name} · level ${bestLevel()}`;
  $('board-me').classList.remove('hidden');
  status.textContent = 'Loading…';
  try {
    await submitScore();
    const rows = await board.fetchTop(50);
    if ($('board').classList.contains('hidden')) return;
    status.textContent = rows.length ? 'Furthest level beaten' : 'No scores yet. Beat a level to get on the board!';
    const medals = ['🥇', '🥈', '🥉'];
    shownRows = rows;
    list.innerHTML = rows.map((r, i) => {
      const mine = r.name === save.name;
      const flag = mine ? ''
        : reported.has(r.name) ? '<span class="reported">Reported</span>'
        : `<button class="report-btn" data-row="${i}" aria-label="Report this nickname">⚑</button>`;
      return `
      <li class="${mine ? 'me' : ''}">
        <span class="rank">${medals[i] || i + 1}</span>
        <span class="who">${escapeHtml(r.name)}</span>
        <span class="lvl">Level ${r.level}</span>
        ${flag}
      </li>`;
    }).join('');
  } catch {
    status.textContent = "Couldn't load the leaderboard. Check your internet and try again.";
  }
}

// ---------- playing ----------

function showHelp(html, seconds = 0) {
  clearTimeout(helpTimer);
  $('help').innerHTML = html;
  $('help').classList.remove('hidden');
  if (seconds) helpTimer = setTimeout(hideHelp, seconds * 1000);
}

function hideHelp() {
  clearTimeout(helpTimer);
  $('help').classList.add('hidden');
}

function startLevel(n, { retry = false, duel: d = null } = {}) {
  currentLevel = n;
  duel = d;
  current = getLevel(n);
  if (duel) {
    // A friend's challenge is a plain race: no trophy rules on top.
    current = { ...current };
    delete current.challenge;
  }
  show('game');
  game.load(current);
  $('hud-level').textContent = duel ? `Level ${n} · ⚔️` : `Level ${n}`;
  updateLeft();
  updateMistakes(0);
  updateGoal();
  hideHelp();
  if (duel?.own && !retry) showHelp(`<b>Your challenge</b><br>Beat ${duel.self ? 'your best' : escapeHtml(duel.name)}: ${describe(duel)}.<br>The clock starts on your first tap.`, 6);
  else if (duel && !retry) showHelp(`<b>${escapeHtml(duel.name)}'s challenge</b><br>Beat ${describe(duel)}.<br>The clock starts on your first tap.`, 6);
  else if (current.challenge && !retry) showHelp(CHALLENGES[current.challenge].intro(current), 6);
  else if (n === 1 && !save.seenHelp) showHelp('Tap a cube to slide it out.<br>Drag to turn &middot; pinch to zoom.');
}

function updateGoal() {
  const goal = $('hud-goal');
  if (race?.playing) return goal.classList.add('hidden');
  if (duel) {
    const mine = { time_ms: game.elapsed * 1000, bumps: game.mistakes };
    goal.classList.remove('hidden');
    goal.textContent = `⚔️ You ${formatMs(duelScore(mine))} · ${duel.name} ${formatMs(duelScore(duel))}`;
    goal.classList.toggle('over', duelScore(mine) > duelScore(duel));
    return;
  }
  const info = current && CHALLENGES[current.challenge];
  goal.classList.toggle('hidden', !info);
  if (!info) return;
  goal.textContent = info.goal(current);
  goal.classList.toggle('over', Boolean(info.over?.(current)));
}

function updateLeft() {
  const left = game.remaining;
  $('hud-left').textContent = `${left} ${left === 1 ? 'cube' : 'cubes'} left`;
}

function updateMistakes(m) {
  $('hud-mistakes').classList.toggle('as-text', Boolean(duel));
  if (duel) {
    $('hud-mistakes').textContent = m ? `${m} bump${m === 1 ? '' : 's'} (+${m * 5}s)` : 'No bumps';
    return;
  }
  if (current?.challenge === 'perfect') {
    $('hud-mistakes').textContent = ''; // a bump restarts, so stars don't apply
    return;
  }
  const s = starsFor(m);
  $('hud-mistakes').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
  $('hud-mistakes').setAttribute('aria-label', `${s} stars`);
}

// Did this win earn the challenge trophy, and what should we say about it?
function challengeResult(level) {
  switch (level.challenge) {
    case 'picture':
      return { trophy: true, text: `You cleared the ${level.picture.toLowerCase()}!` };
    case 'perfect':
      return { trophy: true, text: 'Not a single bump. Perfect!' };
    case 'speed': {
      const t = game.elapsed, target = level.targetSeconds;
      return t <= target
        ? { trophy: true, text: `Done in ${formatTime(t)}, inside ${formatTime(target)}!` }
        : { trophy: false, text: `Done in ${formatTime(t)}. Finish within ${formatTime(target)} to win the trophy.` };
    }
    case 'taps': {
      const taps = game.taps, limit = level.tapLimit;
      return taps <= limit
        ? { trophy: true, text: `Done in ${taps} taps, within ${limit}!` }
        : { trophy: false, text: `Done in ${taps} taps. Use ${limit} or fewer to win the trophy.` };
    }
  }
  return null;
}

// ---------- celebrations ----------

const CHEERS = {
  3: ['Perfect!', 'Flawless!', 'Brilliant!', 'Spotless!', 'Masterful!'],
  2: ['Great job!', 'Nicely done!', 'Smooth!', 'Lovely!'],
  1: ['Well done!', 'You did it!', 'Cleared!', 'Got there!'],
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Quick runs of cubes climb a musical scale; a pause or a bump starts again.
let combo = 0;
let lastPop = 0;

function onCubeRemoved(remaining) {
  const now = performance.now();
  if (now - lastPop > 1500) combo = 0;
  lastPop = now;
  play('pop', combo++);
  vibrate(8);
  if (remaining === 0 && race?.playing && race.idx + 1 < race.levels.length) {
    play('star', 2); // a level of the race done; the big finish is saved for the end
  } else if (remaining === 0) {
    play('finale');
    vibrate([15, 40, 15, 40, 30]);
    confetti(levelColors());
  }
}

function levelColors() {
  const fromCubes = current.cubes.map((c) => c[4]).filter(Boolean);
  const colors = [...new Set(fromCubes.length ? fromCubes : current.palette)];
  return [...colors, '#ffc53d', '#6c63ff', '#ffffff'];
}

function onWin(mistakes) {
  if (race?.playing) return raceLevelDone();
  if (duel) return onDuelWin(mistakes);
  const stars = starsFor(mistakes);
  const result = challengeResult(current);
  const firstClear = currentLevel >= save.unlocked;
  save.stars[currentLevel] = Math.max(save.stars[currentLevel] || 0, stars);
  if (result?.trophy) save.trophies[currentLevel] = true;
  save.unlocked = Math.max(save.unlocked, currentLevel + 1);
  // Count clean (no-bump) clears in a row.
  save.perfectStreak = mistakes === 0 ? (save.perfectStreak || 0) + 1 : 0;
  store.save(save);
  submitScore();
  play('win');
  updateGoal();

  const milestone = firstClear && currentLevel % 10 === 0;
  if (milestone) setTimeout(() => confetti(levelColors(), { count: 160, duration: 3200 }), 300);

  const cubes = current.cubes.length;
  $('win-stats').textContent = `${cubes} cubes cleared` + (game.elapsed >= 1 ? ` in ${formatTime(game.elapsed)}` : '');
  const streak = save.perfectStreak;
  $('win-streak').textContent = streak >= 2 ? `🔥 ${streak} perfect levels in a row!` : '';
  $('win-streak').classList.toggle('hidden', streak < 2);
  $('win-title').classList.toggle('milestone', milestone);

  lastResult = { level: currentLevel, time_ms: Math.round(game.elapsed * 1000), bumps: mistakes };
  $('next-btn').classList.remove('hidden');
  $('challenge-btn').textContent = '⚔️ Challenge a friend';
  $('challenge-btn').classList.toggle('hidden', !board.isConfigured() || lastResult.time_ms < 500);
  $('retry-btn').textContent = 'Try again for the trophy';
  $('win-trophy').textContent = '🏆';
  $('win-stars').classList.toggle('hidden', Boolean(result));
  $('win-trophy').classList.toggle('hidden', !result);
  $('retry-btn').classList.toggle('hidden', !result || result.trophy);
  if (result) {
    $('win-trophy').classList.toggle('missed', !result.trophy);
    $('win-title').textContent = result.trophy ? 'Trophy won!' : 'Level complete!';
    $('win-text').textContent = result.text;
  } else {
    $('win-stars').innerHTML = [1, 2, 3].map((i) =>
      STAR_SVG.replace('<svg', `<svg class="${i <= stars ? 'on' : ''}"`)).join('');
    // Each earned star lands with its own note, in time with its animation.
    for (let i = 0; i < stars; i++) setTimeout(() => play('star', i), 250 + i * 150);
    const notes = { 3: 'Not a single bump.', 2: 'Only a bump or two.', 1: 'Every cube cleared.' };
    $('win-title').textContent = pick(CHEERS[stars]);
    $('win-text').textContent = notes[stars];
  }
  if (milestone) $('win-title').textContent = `Level ${currentLevel} cleared! 🎉`;
  $('win').classList.remove('hidden');
}

// ---------- friend challenges ----------

function showToast(message, seconds = 4) {
  const t = $('toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add('hidden'), seconds * 1000);
}

// Remember challenges sent and received on this phone, newest first.
function rememberDuel(role, d) {
  const list = (save.duels || []).filter((x) => x.code !== d.code);
  list.unshift({ code: d.code, role, level: d.level, name: d.name });
  save.duels = list.slice(0, 30);
  store.save(save);
}

// Resolves with the player's nickname, asking for one first if needed (null if cancelled).
function ensureNickname(reason) {
  if (save.name) return Promise.resolve(save.name);
  return new Promise((resolve) => {
    $('name-reason').textContent = reason;
    $('nick-input').value = '';
    $('nick-error').textContent = '';
    $('name-modal').classList.remove('hidden');
    ensureNickname.done = (name) => {
      $('name-modal').classList.add('hidden');
      resolve(name);
    };
  });
}

async function sendChallenge(result) {
  const name = await ensureNickname('So your friend knows who challenged them.');
  if (!name) return;
  showToast('Creating your challenge…', 10);
  let d;
  try {
    d = await board.createDuel(save.playerId, name, result.level, result.time_ms, result.bumps);
  } catch (err) {
    showToast(err.message === 'too many challenges today'
      ? "That's a lot of challenges for one day! Try again tomorrow."
      : "Couldn't create the challenge. Check your internet and try again.");
    return;
  }
  $('toast').classList.add('hidden');
  rememberDuel('sent', d);
  await shareDuel(d);
}

async function shareDuel(d) {
  const url = duelLink(d.code);
  const text = `${d.name} challenges you to Whoosh Blocks level ${d.level}! Cleared in ${describe(d)}. Can you beat it?`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Whoosh Blocks challenge', text, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // they closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast('Challenge link copied. Paste it in a message to a friend!');
  } catch {
    prompt('Copy this link and send it to a friend:', url);
  }
}

// Someone opened a challenge link.
async function openDuel(code) {
  if (!board.isConfigured()) return;
  let d;
  try {
    d = await board.getDuel(code);
  } catch {
    showToast("Couldn't load the challenge. Check your internet and try again.");
    return;
  }
  if (!d) {
    showToast("That challenge has expired or doesn't exist.");
    return;
  }
  if ((save.duels || []).some((x) => x.code === d.code && x.role === 'sent')) {
    go('duels'); // their own challenge: show how friends are doing
    return;
  }
  rememberDuel('received', d);
  pendingDuel = d;
  $('duel-title').textContent = `${d.name} challenges you!`;
  $('duel-text').textContent = `Level ${d.level} · ${describe(d)}`;
  $('duel-modal').classList.remove('hidden');
}
let pendingDuel = null;

async function acceptDuel(d) {
  $('duel-modal').classList.add('hidden');
  const name = await ensureNickname(`So ${d.name} can see your result.`);
  if (!name) return;
  go('game', { level: d.level, duel: d });
}

// Replay a challenge you sent, racing whoever leads it now (you, if nobody has beaten you).
function beatOwnScore(d) {
  const mine = { name: 'Your best', time_ms: d.time_ms, bumps: d.bumps, self: true };
  const best = d.results[0];
  const rival = best && duelScore(best) < duelScore(mine) ? best : mine;
  go('game', { level: d.level, duel: { code: d.code, level: d.level, own: true, ...rival } });
}

async function onDuelWin(mistakes) {
  const d = duel;
  const mine = { name: save.name, time_ms: Math.max(500, Math.round(game.elapsed * 1000)), bumps: mistakes };
  const result = outcome(mine, d);
  play('win');
  if (result === 'win') setTimeout(() => confetti(levelColors(), { count: 160, duration: 3200 }), 300);

  $('win-stars').classList.add('hidden');
  $('win-streak').classList.add('hidden');
  $('win-trophy').classList.remove('hidden', 'missed');
  $('win-trophy').textContent = result === 'lose' ? '⚔️' : '🏆';
  $('win-title').classList.remove('milestone');
  if (d.own) {
    $('win-title').textContent = result === 'win' ? (d.self ? 'New best! 🎉' : "You're back on top! 🎉")
      : result === 'tie' ? "It's a tie!" : d.self ? 'Not quite your best' : `${d.name} is still ahead`;
  } else {
    $('win-title').textContent = result === 'win' ? 'You win! 🎉' : result === 'tie' ? "It's a tie!" : `${d.name} wins this time`;
  }
  $('win-text').textContent = `You: ${describe(mine)}\n${d.name}: ${describe(d)}`;
  $('win-stats').textContent = result !== 'lose' ? '' : d.own ? 'Have another go!' : 'Have another go, or challenge them back!';
  $('next-btn').classList.add('hidden');
  $('retry-btn').textContent = 'Try again';
  $('retry-btn').classList.remove('hidden');
  $('challenge-btn').textContent = '⚔️ Challenge back';
  $('challenge-btn').classList.toggle('hidden', Boolean(d.own));
  lastResult = { level: currentLevel, time_ms: mine.time_ms, bumps: mine.bumps };
  $('win').classList.remove('hidden');

  try {
    await board.submitDuelResult(d.code, save.playerId, save.name, mine.time_ms, mine.bumps);
  } catch {
    showToast("Couldn't send your result. It wasn't saved, so try again when you're online.");
  }
}

async function renderDuels() {
  const list = $('duels-list'), status = $('duels-status');
  const mine = save.duels || [];
  list.innerHTML = '';
  if (!mine.length) {
    status.textContent = 'Beat a level, then tap "Challenge a friend" on the win screen to send your first challenge.';
    return;
  }
  status.textContent = 'Loading…';
  const loaded = await Promise.all(mine.map((x) => board.getDuel(x.code).catch(() => undefined)));
  if ($('duels').classList.contains('hidden')) return;
  status.textContent = loaded.includes(undefined) ? "Some challenges couldn't load. Check your internet." : '';
  list.innerHTML = mine.map((x, i) => {
    const d = loaded[i];
    const heading = x.role === 'sent' ? `You challenged friends · Level ${x.level}` : `From ${escapeHtml(x.name)} · Level ${x.level}`;
    if (d === null) return `<div class="duel-card"><h3>${heading}</h3><p class="sub">This challenge has expired.</p></div>`;
    if (d === undefined) return `<div class="duel-card"><h3>${heading}</h3><p class="sub">Couldn't load.</p></div>`;
    const rows = [{ name: d.name, time_ms: d.time_ms, bumps: d.bumps, owner: true }, ...d.results]
      .sort((a, b) => duelScore(a) - duelScore(b));
    const items = rows.map((r, n) => {
      const me = (x.role === 'sent' && r.owner) || (x.role === 'received' && !r.owner && r.name === save.name);
      return `<li class="${me ? 'me' : ''}"><span>${n === 0 ? '🏆 ' : ''}${me ? 'You' : escapeHtml(r.name)}</span><span>${describe(r)}</span></li>`;
    }).join('');
    const nobody = x.role === 'sent' && !d.results.length ? '<p class="sub">No one has played it yet.</p>' : '';
    const action = x.role === 'sent'
      ? `<button class="btn secondary" data-share="${i}">Share again</button><button class="btn" data-beat="${i}">Beat your score</button>`
      : `<button class="btn" data-play="${i}">Play</button>`;
    return `<div class="duel-card"><h3>${heading}</h3>${nobody}<ol>${items}</ol><div class="actions">${action}</div></div>`;
  }).join('');
  renderDuels.loaded = loaded;
}

// ---------- live races ----------

let race = null;
// { code, room, me, players, hostId, round, levels, total, idx, cleared, bumps,
//   startedAt, playing, finished, progress: Map(id -> { id, name, cleared, bumps, time_ms, gone }) }
const raceSettings = { count: 3, difficulty: 'easy' };
const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// Tests can give each tab its own racer name.
function raceName(reason) {
  const debugName = location.search.includes('debug') && new URLSearchParams(location.search).get('racename');
  return debugName ? Promise.resolve(debugName) : ensureNickname(reason);
}

function renderRaceScreen() {
  const inRoom = Boolean(race?.room);
  $('race-entry').classList.toggle('hidden', inRoom);
  $('race-lobby').classList.toggle('hidden', !inRoom);
  if (!inRoom) return;
  $('race-code').textContent = race.code;
  const isHost = race.hostId === race.me.id;
  $('race-players').innerHTML = race.players.map((p) =>
    `<li class="${p.id === race.me.id ? 'me' : ''}">${p.id === race.hostId ? '👑 ' : ''}${escapeHtml(p.name)}</li>`).join('');
  $('race-settings').classList.toggle('hidden', !isHost);
  const host = race.players.find((p) => p.id === race.hostId);
  $('race-wait').textContent = isHost
    ? (race.players.length < 2 ? 'Invite at least one friend to start.' : `${race.players.length} of ${MAX_PLAYERS} players`)
    : `Waiting for ${host ? host.name : 'the host'} to start…`;
  $('race-start').disabled = race.players.length < 2;
  for (const b of document.querySelectorAll('#race-count button')) b.classList.toggle('on', Number(b.dataset.count) === raceSettings.count);
  for (const b of document.querySelectorAll('#race-difficulty button')) b.classList.toggle('on', b.dataset.diff === raceSettings.difficulty);
}

async function enterRace(code, asHost) {
  const name = await raceName('So the other racers know who you are.');
  if (!name) return;
  $('race-status').textContent = 'Connecting…';
  race = { code, me: { id: randomId(), name, host: asHost }, players: [], hostId: null, round: 0, progress: new Map() };
  try {
    const room = await joinRoom(code, race.me, { onPlayers: onRacePlayers, onMessage: onRaceMessage });
    if (!race || race.code !== code) return room.leave(); // left while connecting
    race.room = room;
    $('race-status').textContent = '';
    history.replaceState({ screen: 'race' }, '');
    renderRaceScreen();
  } catch (err) {
    race = null;
    $('race-status').textContent = `Couldn't connect to the race. Check your internet and try again. (${err.message})`;
  }
}

function onRacePlayers(list) {
  if (!race) return;
  const players = [...list].sort((a, b) => a.joinedAt - b.joinedAt);
  const myIndex = players.findIndex((p) => p.id === race.me.id);
  if (myIndex >= MAX_PLAYERS) {
    leaveRace();
    showToast(`That race is full (${MAX_PLAYERS} players).`);
    return;
  }
  race.players = players.slice(0, MAX_PLAYERS);
  race.hostId = (race.players.find((p) => p.host) || race.players[0])?.id;
  // Anyone who disappears mid-race is marked as gone.
  for (const [id, p] of race.progress) if (!race.players.some((x) => x.id === id) && p.time_ms == null) p.gone = true;
  renderRaceScreen();
  if (race.playing) renderRaceBoard();
  if (!$('race-results').classList.contains('hidden')) renderRaceResults();
}

function onRaceMessage(type, data, from) {
  if (!race) return;
  if (type === 'start') {
    if (data.round > race.round) beginRound(data);
    return;
  }
  if (type === 'cheer') {
    showCheer(race.players.find((x) => x.id === from)?.name || '?', data.emoji);
    return;
  }
  if (data.round !== race.round) return;
  const p = race.progress.get(from) || { id: from, name: race.players.find((x) => x.id === from)?.name || '?' };
  if (type === 'progress') Object.assign(p, { cleared: data.cleared, bumps: data.bumps });
  if (type === 'finish') Object.assign(p, { cleared: race.total, time_ms: data.time_ms, bumps: data.bumps });
  if (type === 'quit') p.gone = true;
  race.progress.set(from, p);
  renderRaceBoard();
  if (!$('race-results').classList.contains('hidden')) renderRaceResults();
}

function startRace() {
  if (!race?.room || race.hostId !== race.me.id || race.players.length < 2) return;
  const data = { round: race.round + 1, levels: pickLevels(raceSettings.difficulty, raceSettings.count) };
  race.room.send('start', data);
  beginRound(data);
}

function beginRound({ round, levels }) {
  Object.assign(race, {
    round, levels, total: totalCubes(levels), idx: 0, cleared: 0, bumps: 0,
    playing: true, finished: false, startedAt: null,
    progress: new Map(race.players.map((p) => [p.id, { id: p.id, name: p.name, cleared: 0, bumps: 0 }])),
  });
  duel = null;
  $('race-results').classList.add('hidden');
  history.pushState({ screen: 'race-game' }, '');
  show('game');
  // Everyone sees the first puzzle during the countdown, but can't tap it yet.
  startRaceLevel(0);
  game.won = true;
  $('hud-left').textContent = 'Get ready…';
  renderRaceBoard();
  let n = 3;
  const tick = () => {
    if (!race || race.round !== round) return;
    $('countdown').classList.remove('hidden');
    $('countdown').innerHTML = `<span>${n > 0 ? n : 'Go!'}</span>`;
    play('star', n > 0 ? 0 : 3);
    if (n-- > 0) return void setTimeout(tick, 800);
    setTimeout(() => $('countdown').classList.add('hidden'), 500);
    race.startedAt = performance.now();
    game.won = false;
    updateLeft();
  };
  tick();
}

function startRaceLevel(i) {
  race.idx = i;
  current = { ...getLevel(race.levels[i]) };
  delete current.challenge;
  game.load(current);
  $('hud-level').textContent = `Race · Level ${i + 1} of ${race.levels.length}`;
  updateLeft();
  updateMistakes(race.bumps);
}

let progressTimer = null;
function sendProgress() {
  const mine = race.progress.get(race.me.id);
  Object.assign(mine, { cleared: race.cleared, bumps: race.bumps });
  renderRaceBoard();
  if (progressTimer) return; // at most a few updates a second
  progressTimer = setTimeout(() => {
    progressTimer = null;
    if (race?.playing) race.room.send('progress', { round: race.round, cleared: race.cleared, bumps: race.bumps });
  }, 250);
}

function raceLevelDone() {
  if (race.idx + 1 < race.levels.length) {
    showHelp(`<b>Level ${race.idx + 2} of ${race.levels.length}</b>`, 1.2);
    setTimeout(() => { if (race?.playing && !race.finished) startRaceLevel(race.idx + 1); }, 700);
    return;
  }
  race.finished = true;
  const time_ms = Math.round(performance.now() - race.startedAt);
  Object.assign(race.progress.get(race.me.id), { cleared: race.total, time_ms, bumps: race.bumps });
  race.room.send('finish', { round: race.round, time_ms, bumps: race.bumps });
  play('win');
  renderRaceResults();
  $('race-results').classList.remove('hidden');
  const first = standings([...race.progress.values()])[0];
  if (first.id === race.me.id) confetti(levelColors(), { count: 160, duration: 3200 });
}

function renderRaceBoard() {
  if (!race?.playing) return;
  const rows = standings([...race.progress.values()]);
  $('race-board').innerHTML = rows.map((p, i) => {
    const pct = Math.min(100, Math.round(((p.cleared || 0) / race.total) * 100));
    const val = p.time_ms != null ? formatMs(duelScore(p)) : p.gone ? 'left' : `${pct}%`;
    return `<li class="${p.id === race.me.id ? 'me' : ''} ${p.gone ? 'gone' : ''}"><span>${i + 1}</span><span class="who">${escapeHtml(p.name)}</span><span class="track"><i style="width:${pct}%"></i></span><span class="val">${val}</span></li>`;
  }).join('');
}

function renderRaceResults() {
  const rows = standings([...race.progress.values()]);
  const stillRacing = rows.some((p) => p.time_ms == null && !p.gone);
  const myPlace = rows.findIndex((p) => p.id === race.me.id) + 1;
  $('race-results-icon').textContent = myPlace === 1 ? '🏆' : '🏁';
  $('race-results-title').textContent = stillRacing
    ? (myPlace === 1 ? "You're in the lead!" : `You're ${ordinal(myPlace)} so far`)
    : (myPlace === 1 ? 'You win! 🎉' : `You came ${ordinal(myPlace)}`);
  $('race-results-list').innerHTML = rows.map((p, i) => {
    const val = p.time_ms != null ? describe(p) : p.gone ? 'left' : `racing… ${Math.round(((p.cleared || 0) / race.total) * 100)}%`;
    return `<li class="${p.id === race.me.id ? 'me' : ''} ${p.gone ? 'gone' : ''}"><span>${i + 1}. ${escapeHtml(p.name)}</span><span>${val}</span></li>`;
  }).join('');
  const isHost = race.hostId === race.me.id;
  $('race-rematch').classList.toggle('hidden', !isHost);
  const host = race.players.find((p) => p.id === race.hostId);
  $('race-results-wait').textContent = isHost ? '' : `Waiting for ${host ? host.name : 'the host'} to start a rematch…`;
}

let lastCheer = 0;
function sendCheer(emoji) {
  // Allowed any time you're in a room (racing, finished and waiting, or in the
  // waiting room), but no more than one every 0.7 seconds.
  if (!race?.room || performance.now() - lastCheer < 700) return;
  lastCheer = performance.now();
  race.room.send('cheer', { round: race.round, emoji });
  showCheer('You', emoji);
}

function showCheer(name, emoji) {
  const el = document.createElement('div');
  el.className = 'cheer';
  el.textContent = `${name} ${emoji}`;
  el.style.left = `${10 + Math.random() * 55}%`;
  $('cheer-layer').appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function leaveRace() {
  if (!race) return;
  if (race.playing && !race.finished) race.room?.send('quit', { round: race.round });
  race.room?.leave();
  race = null;
  $('race-results').classList.add('hidden');
  $('countdown').classList.add('hidden');
}

async function shareRace() {
  const url = `${location.origin}${location.pathname}?race=${race.code}`;
  const text = `Race me in Whoosh Blocks! Room code ${race.code}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Whoosh Blocks race', text, url }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    showToast('Invite link copied. Paste it in a message to your friends!');
  } catch {
    prompt('Copy this link and send it to your friends:', url);
  }
}

// A perfect-run challenge was bumped: start it over.
function onFail() {
  showHelp('<b>Bump!</b><br>Starting over…');
  setTimeout(() => {
    if (!$('hud').classList.contains('hidden') && current?.challenge === 'perfect' && game.failed) {
      startLevel(currentLevel, { retry: true });
      showHelp('Perfect run: no bumps allowed.', 3);
    }
  }, 1300);
}

// ---------- settings ----------

function openSettings() {
  $('sound-toggle').checked = save.sound;
  $('vibrate-toggle').checked = save.vibrate;
  $('settings').classList.remove('hidden');
}

// ---------- start up ----------

function init() {
  // Set up updates first, so even a broken start can still receive a fix.
  setupUpdates();
  try {
    game = new Game($('stage'), {
      onRemove: (remaining) => {
        onCubeRemoved(remaining);
        updateLeft();
        if (race?.playing && !race.finished) { race.cleared++; sendProgress(); }
        if (!save.seenHelp) {
          save.seenHelp = true;
          store.save(save);
          hideHelp();
        }
      },
      onBump: () => {
        combo = 0; play('bump'); vibrate(35);
        if (race?.playing && !race.finished) { race.bumps++; sendProgress(); }
      },
      onMistake: updateMistakes,
      onTap: () => {
        updateGoal();
        if (current?.challenge && !game.failed) hideHelp();
      },
      onFail,
      onWin,
    });
  } catch (err) {
    console.error(err);
    $('error').classList.remove('hidden');
    $('error-detail').textContent = `${err?.message || err} · ${navigator.userAgent}`;
    $('home').classList.add('hidden');
    window.whooshReady = true; // the error is already shown with its reason
    return;
  }

  // Audio may only start after the first touch.
  window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });

  on('play-btn', 'click', () => { play('click'); go('game', { level: save.unlocked }); });
  on('levels-btn', 'click', () => { play('click'); go('levels'); });
  on('board-btn', 'click', () => { play('click'); go('board'); });
  on('board-join', 'submit', joinBoard);
  on('rename-btn', 'click', () => { play('click'); renderBoard({ askName: true }); });
  on('remove-btn', 'click', () => { play('click'); removeMe(); });
  on('board-list', 'click', (e) => {
    const btn = e.target.closest('.report-btn');
    if (btn) reportRow(Number(btn.dataset.row));
  });
  on('settings-btn', 'click', () => { play('click'); go('home', { modal: 'settings' }); });
  for (const b of document.querySelectorAll('[data-back]')) {
    b.addEventListener('click', () => { play('click'); history.back(); });
  }
  on('restart-btn', 'click', () => { play('click'); startLevel(currentLevel, { duel }); });
  on('hint-btn', 'click', () => { play('click'); game.hint(); });
  on('next-btn', 'click', () => { play('click'); go('game', { level: currentLevel + 1 }, true); });
  on('win-menu-btn', 'click', () => { play('click'); history.back(); });
  on('retry-btn', 'click', () => { play('click'); startLevel(currentLevel, { retry: true, duel }); });
  on('challenge-btn', 'click', () => { play('click'); if (lastResult) sendChallenge(lastResult); });
  on('duels-btn', 'click', () => { play('click'); go('duels'); });
  on('race-btn', 'click', () => { play('click'); go('race'); });
  on('race-create', 'click', () => { play('click'); enterRace(newRoomCode(), true); });
  on('race-join-form', 'submit', (e) => {
    e.preventDefault();
    const code = $('race-code-input').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) { $('race-status').textContent = 'Room codes are 5 letters and numbers.'; return; }
    play('click');
    enterRace(code, false);
  });
  on('race-share', 'click', () => { play('click'); shareRace(); });
  on('race-start', 'click', () => { play('click'); startRace(); });
  on('race-rematch', 'click', () => { play('click'); startRace(); });
  on('race-leave', 'click', () => { play('click'); leaveRace(); go('home', {}, true); });
  on('race-count', 'click', (e) => { const b = e.target.closest('[data-count]'); if (b) { raceSettings.count = Number(b.dataset.count); renderRaceScreen(); } });
  on('race-difficulty', 'click', (e) => { const b = e.target.closest('[data-diff]'); if (b) { raceSettings.difficulty = b.dataset.diff; renderRaceScreen(); } });
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-cheer]'); if (b) sendCheer(b.dataset.cheer); });
  on('duel-accept', 'click', () => { play('click'); if (pendingDuel) acceptDuel(pendingDuel); });
  on('duel-decline', 'click', () => { play('click'); $('duel-modal').classList.add('hidden'); });
  on('name-form', 'submit', (e) => {
    e.preventDefault();
    const name = $('nick-input').value.trim();
    const problem = nameProblem(name);
    $('nick-error').textContent = problem;
    if (problem) return;
    play('click');
    save.name = name;
    store.save(save);
    submitScore();
    ensureNickname.done?.(name);
  });
  on('nick-cancel', 'click', () => { play('click'); ensureNickname.done?.(null); });
  on('duels-list', 'click', (e) => {
    const share = e.target.closest('[data-share]');
    const playBtn = e.target.closest('[data-play]');
    const beatBtn = e.target.closest('[data-beat]');
    const loaded = renderDuels.loaded || [];
    if (share && loaded[share.dataset.share]) { play('click'); shareDuel(loaded[share.dataset.share]); }
    if (playBtn && loaded[playBtn.dataset.play]) { play('click'); acceptDuel(loaded[playBtn.dataset.play]); }
    if (beatBtn && loaded[beatBtn.dataset.beat]) { play('click'); beatOwnScore(loaded[beatBtn.dataset.beat]); }
  });

  // Keep the speed-challenge clock ticking on screen, and pause it while the
  // app is in the background.
  setInterval(() => {
    if ((duel || current?.challenge === 'speed') && !$('hud').classList.contains('hidden')) updateGoal();
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pauseClock();
    else game.resumeClock();
  });

  on('sound-toggle', 'change', (e) => {
    save.sound = e.target.checked;
    setSoundEnabled(save.sound);
    store.save(save);
    play('click');
  });
  on('vibrate-toggle', 'change', (e) => {
    save.vibrate = e.target.checked;
    store.save(save);
    vibrate(20);
  });
  on('reset-btn', 'click', () => {
    if (confirm('Start over from level 1? Your stars and trophies will be cleared.')) {
      save = store.reset(save);
      setSoundEnabled(save.sound);
      openSettings();
    }
  });
  on('settings-close', 'click', () => { play('click'); history.back(); });

  if (location.search.includes('debug')) window.whoosh = { game, startLevel };

  const duelCode = codeFromUrl(location.search);
  const raceCode = roomFromUrl(location.search);
  const cleanUrl = location.pathname + (location.search.includes('debug') ? `?${new URLSearchParams(location.search).toString().replace(/(^|&)(c|race)=[^&]*/g, '')}` : '');
  history.replaceState({ screen: 'home' }, '', duelCode || raceCode ? cleanUrl : undefined);
  show('home');
  if (duelCode) openDuel(duelCode);
  if (raceCode && board.isConfigured()) { go('race'); enterRace(raceCode, false); }
  submitScore(); // catch up on any score earned while offline
  window.whooshReady = true;
}

// ---------- offline copy & updates ----------

function setupUpdates() {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || (location.protocol !== 'https:' && !local)) return;

  let updating = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updating) return; // the very first install also fires this; don't reload for it
    updating = false;
    location.reload();
  });
  on('update-btn', 'click', () => {
    if (!waitingWorker) return;
    updating = true;
    $('update-btn').disabled = true;
    $('update-btn').textContent = 'Updating…';
    waitingWorker.postMessage('skipWaiting');
  });

  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = () => {
      // Only offer an update over an existing version, not on the first visit.
      if (!reg.waiting || !navigator.serviceWorker.controller) return;
      waitingWorker = reg.waiting;
      if ($('hud').classList.contains('hidden')) $('update-bar').classList.remove('hidden');
    };
    offer();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(); });
    });
    // Look for a new version whenever the game comes back to the foreground,
    // and every hour while it stays open.
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch(() => {});
}

init();
