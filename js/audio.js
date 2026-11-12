// Freihändiger Audio-Modus (Prinzip „Pimsleur“): Deutsch hören → Pause zum selbst Sagen →
// Italienisch hören → nachsprechen → nochmal langsam. Ideal unterwegs.
import { h, svg, ICONS } from './ui.js';
import { playSequence, stopSpeaking } from './speech.js';

const PAUSES = { kurz: 2500, normal: 4000, lang: 6000 };

export function openAudioMode(items, { onClose } = {}) {
  let pauseKey = localStorage.getItem('parla.audioPause') || 'normal';
  let current = 0;
  let player = null;
  let wakeLock = null;

  const root = h('div', { class: 'lesson audio-mode' });
  const counter = h('div', { class: 'small muted bold center' });
  const phase = h('div', { class: 'tag center' });
  const de = h('div', { class: 'audio-de' });
  const it = h('div', { class: 'audio-it', lang: 'it' });
  const playBtn = h('button', { class: 'mic', 'aria-label': 'Abspielen', onclick: togglePlay });
  const pauseSelect = h('select', { class: 'search', 'aria-label': 'Pausenlänge', onchange: (e) => { pauseKey = e.target.value; localStorage.setItem('parla.audioPause', pauseKey); } },
    Object.keys(PAUSES).map(k => h('option', { value: k, selected: k === pauseKey }, `Denkpause: ${k}`)));

  function steps(item) {
    const think = PAUSES[pauseKey];
    return [
      { text: item.de, lang: 'de', pause: think, phase: '🇩🇪 Wie sagt man das auf Italienisch?' },
      { text: item.it, pause: think * 0.8, phase: '🇮🇹 Hör zu – und sprich nach' },
      { text: item.it, slow: true, pause: 1200, phase: '🐢 Noch einmal langsam' },
    ];
  }

  function render(stepIndex = -1) {
    const item = items[current];
    counter.textContent = `Satz ${current + 1} von ${items.length}`;
    de.textContent = item.de;
    it.textContent = stepIndex >= 1 ? item.it : '· · ·';
    phase.textContent = stepIndex >= 0 ? steps(item)[stepIndex].phase : 'Bereit? Tippe auf Play.';
    playBtn.replaceChildren(svg(player ? ICONS.stop : ICONS.speaker));
    playBtn.classList.toggle('recording', !!player);
  }

  function playCurrent() {
    player = playSequence(steps(items[current]), {
      onStep: (i) => render(i),
      onDone: () => {
        if (current < items.length - 1) { current++; playCurrent(); }
        else { player = null; phase.textContent = '🎉 Fertig! Bravissimo.'; render(-1); phase.textContent = '🎉 Fertig! Bravissimo.'; }
      },
    });
    render(0);
  }

  async function togglePlay() {
    if (player) { player.stop(); player = null; render(-1); releaseWake(); return; }
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* nicht unterstützt */ }
    playCurrent();
  }
  function releaseWake() { try { wakeLock?.release(); } catch { /* egal */ } wakeLock = null; }

  function jump(delta) {
    player?.stop();
    player = null;
    current = Math.max(0, Math.min(items.length - 1, current + delta));
    playCurrent();
  }

  function close() {
    player?.stop();
    stopSpeaking();
    releaseWake();
    root.remove();
    if (!document.querySelector('.sheet, .lesson')) document.body.classList.remove('no-scroll');
    onClose?.();
  }

  root.append(
    h('div', { class: 'lesson-header' },
      h('button', { class: 'icon-btn', 'aria-label': 'Audio-Modus beenden', onclick: close }, svg(ICONS.close)),
      h('div', { class: 'bold' }, '🎧 Audio-Training'),
    ),
    h('div', { class: 'lesson-body', style: { justifyContent: 'center', textAlign: 'center' } },
      counter, phase, de, it,
      h('div', { class: 'row', style: { justifyContent: 'center', gap: '22px' } },
        h('button', { class: 'speak-btn mid', 'aria-label': 'Vorheriger Satz', onclick: () => jump(-1) }, '⏮'),
        playBtn,
        h('button', { class: 'speak-btn mid', 'aria-label': 'Nächster Satz', onclick: () => jump(1) }, '⏭')),
      pauseSelect,
      h('div', { class: 'small muted' }, 'Sag den Satz in der Pause laut auf Italienisch, bevor du die Lösung hörst. Lass das Display an – iOS stoppt die Sprachausgabe bei gesperrtem Bildschirm.'),
    ),
  );
  document.body.append(root);
  document.body.classList.add('no-scroll');
  render(-1);
}
