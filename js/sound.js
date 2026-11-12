// Kurze Soundeffekte per Web Audio (iOS hat keine Vibration für Webseiten).
import { p } from './state.js';

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, duration, type = 'sine', gain = 0.12) {
  const c = audio();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime + start;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function playCorrect() {
  if (!p.sounds) return;
  tone(660, 0, 0.12);
  tone(990, 0.09, 0.18);
}

export function playWrong() {
  if (!p.sounds) return;
  tone(220, 0, 0.22, 'triangle', 0.14);
  tone(180, 0.12, 0.25, 'triangle', 0.12);
}

export function playComplete() {
  if (!p.sounds) return;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.25));
}

export function playTap() {
  if (!p.sounds) return;
  tone(1200, 0, 0.03, 'sine', 0.04);
}
