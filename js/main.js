// App shell: screens, saving progress, sounds, and the Android back button.

import { Game } from './game.js';
import { getLevel, challengeType } from './levels.js';
import * as store from './storage.js';
import { play, unlockAudio, setSoundEnabled } from './audio.js';
import * as board from './leaderboard.js';

const $ = (id) => document.getElementById(id);
let save = store.load();
setSoundEnabled(save.sound);

let game;
let currentLevel = 1;
let current = null; // the level being played
let helpTimer = null;
let waitingWorker = null; // a downloaded new version, waiting for the player to tap Update

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
  for (const id of ['home', 'levels', 'board', 'hud', 'win', 'settings']) $(id).classList.add('hidden');
  game?.setActive(screen === 'game');
  // Offer updates from the menus, never in the middle of a level.
  $('update-bar').classList.toggle('hidden', !waitingWorker || screen === 'game');
  if (screen === 'home') {
    $('home').classList.remove('hidden');
    $('play-btn').textContent = save.unlocked > 1 ? `Play · Level ${save.unlocked}` : 'Play';
    const trophies = Object.keys(save.trophies).length;
    $('trophy-count').textContent = `🏆 ${trophies} ${trophies === 1 ? 'trophy' : 'trophies'}`;
    $('trophy-count').classList.toggle('hidden', trophies === 0);
  } else if (screen === 'levels') {
    renderLevelGrid();
    $('levels').classList.remove('hidden');
  } else if (screen === 'board') {
    $('board').classList.remove('hidden');
    renderBoard();
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
  if (screen === 'game') startLevel(state.level || save.unlocked);
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
    list.innerHTML = rows.map((r, i) => `
      <li class="${r.name === save.name ? 'me' : ''}">
        <span class="rank">${medals[i] || i + 1}</span>
        <span class="who">${escapeHtml(r.name)}</span>
        <span class="lvl">Level ${r.level}</span>
      </li>`).join('');
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

function startLevel(n, { retry = false } = {}) {
  currentLevel = n;
  current = getLevel(n);
  show('game');
  game.load(current);
  $('hud-level').textContent = `Level ${n}`;
  updateLeft();
  updateMistakes(0);
  updateGoal();
  hideHelp();
  if (current.challenge && !retry) showHelp(CHALLENGES[current.challenge].intro(current), 6);
  else if (n === 1 && !save.seenHelp) showHelp('Tap a cube to slide it out.<br>Drag to turn &middot; pinch to zoom.');
}

function updateGoal() {
  const goal = $('hud-goal');
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

function onWin(mistakes) {
  const stars = starsFor(mistakes);
  const result = challengeResult(current);
  save.stars[currentLevel] = Math.max(save.stars[currentLevel] || 0, stars);
  if (result?.trophy) save.trophies[currentLevel] = true;
  save.unlocked = Math.max(save.unlocked, currentLevel + 1);
  store.save(save);
  submitScore();
  play('win');
  vibrate([20, 60, 20]);
  updateGoal();

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
    const msgs = { 3: 'Perfect — no bumps!', 2: 'Great job!', 1: 'Well done!' };
    $('win-title').textContent = 'Level complete!';
    $('win-text').textContent = msgs[stars];
  }
  $('win').classList.remove('hidden');
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
  try {
    game = new Game($('stage'), {
      onRemove: () => {
        play('pop');
        vibrate(8);
        updateLeft();
        if (!save.seenHelp) {
          save.seenHelp = true;
          store.save(save);
          hideHelp();
        }
      },
      onBump: () => { play('bump'); vibrate(35); },
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
    $('home').classList.add('hidden');
    return;
  }

  // Audio may only start after the first touch.
  window.addEventListener('pointerdown', unlockAudio, { once: false, passive: true });

  $('play-btn').addEventListener('click', () => { play('click'); go('game', { level: save.unlocked }); });
  $('levels-btn').addEventListener('click', () => { play('click'); go('levels'); });
  $('board-btn').addEventListener('click', () => { play('click'); go('board'); });
  $('board-join').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('name-input').value.trim().slice(0, 20);
    if (!name) return;
    save.name = name;
    store.save(save);
    $('name-input').blur();
    play('click');
    renderBoard();
  });
  $('rename-btn').addEventListener('click', () => { play('click'); renderBoard({ askName: true }); });
  $('settings-btn').addEventListener('click', () => { play('click'); go('home', { modal: 'settings' }); });
  for (const b of document.querySelectorAll('[data-back]')) {
    b.addEventListener('click', () => { play('click'); history.back(); });
  }
  $('restart-btn').addEventListener('click', () => { play('click'); startLevel(currentLevel); });
  $('hint-btn').addEventListener('click', () => { play('click'); game.hint(); });
  $('next-btn').addEventListener('click', () => { play('click'); go('game', { level: currentLevel + 1 }, true); });
  $('win-menu-btn').addEventListener('click', () => { play('click'); history.back(); });
  $('retry-btn').addEventListener('click', () => { play('click'); startLevel(currentLevel, { retry: true }); });

  // Keep the speed-challenge clock ticking on screen, and pause it while the
  // app is in the background.
  setInterval(() => {
    if (current?.challenge === 'speed' && !$('hud').classList.contains('hidden')) updateGoal();
  }, 250);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.pauseClock();
    else game.resumeClock();
  });

  $('sound-toggle').addEventListener('change', (e) => {
    save.sound = e.target.checked;
    setSoundEnabled(save.sound);
    store.save(save);
    play('click');
  });
  $('vibrate-toggle').addEventListener('change', (e) => {
    save.vibrate = e.target.checked;
    store.save(save);
    vibrate(20);
  });
  $('reset-btn').addEventListener('click', () => {
    if (confirm('Start over from level 1? Your stars and trophies will be cleared.')) {
      save = store.reset(save);
      setSoundEnabled(save.sound);
      openSettings();
    }
  });
  $('settings-close').addEventListener('click', () => { play('click'); history.back(); });

  if (location.search.includes('debug')) window.whoosh = { game, startLevel };

  history.replaceState({ screen: 'home' }, '');
  show('home');
  submitScore(); // catch up on any score earned while offline

  setupUpdates();
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
  $('update-btn').addEventListener('click', () => {
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
