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

export function play(name) {
  if (!enabled || !ctx) return;
  switch (name) {
    case 'pop': {
      const f = 520 + Math.random() * 120;
      tone({ from: f, to: f * 1.9, dur: 0.14, vol: 0.18 });
      break;
    }
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
