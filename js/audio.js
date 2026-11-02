// Small synthesized sound effects (no audio files to download).

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = on;
}

// Browsers only allow audio after a user gesture; call this from one.
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ type = 'sine', from, to = from, start = 0, dur, vol = 0.2 }) {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// Notes of a major pentatonic scale, starting at C5. Any run of them sounds
// pleasant, so quick runs of pops turn into little tunes.
const PENTATONIC = [0, 2, 4, 7, 9];
function note(step) {
  const s = Math.min(step, 14); // stop climbing after three octaves
  const semitones = Math.floor(s / 5) * 12 + PENTATONIC[s % 5];
  return 523.25 * 2 ** (semitones / 12);
}

// `step` picks the note for 'pop' (each quick pop climbs the scale) and 'star'.
export function play(name, step = 0) {
  if (!enabled || !ctx) return;
  switch (name) {
    case 'pop': {
      const f = note(step);
      tone({ from: f, to: f * 1.5, dur: 0.16, vol: 0.17 });
      break;
    }
    case 'finale':
      [0, 2, 4, 5, 7].forEach((s, i) => tone({ from: note(s + 5), dur: 0.22, start: i * 0.06, vol: 0.13 }));
      tone({ type: 'triangle', from: note(10), dur: 0.7, start: 0.32, vol: 0.12 });
      break;
    case 'star':
      tone({ from: note(5 + step * 2), dur: 0.4, vol: 0.16 });
      tone({ from: note(10 + step * 2), dur: 0.3, vol: 0.06 });
      break;
    case 'bump':
      tone({ type: 'triangle', from: 170, to: 80, dur: 0.18, vol: 0.3 });
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone({ from: f, dur: 0.35, start: i * 0.11, vol: 0.16 }));
      break;
    case 'click':
      tone({ from: 900, to: 700, dur: 0.05, vol: 0.06 });
      break;
  }
}
