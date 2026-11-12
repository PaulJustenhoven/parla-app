// Sprachausgabe (speechSynthesis) und Spracherkennung (webkitSpeechRecognition).
//
// iOS-Besonderheiten, die hier berücksichtigt werden:
// • speak() muss (zumindest das erste Mal) direkt im Tipp-Ereignis passieren → synchron, kein setTimeout.
// • Manche Stimmen (v. a. „Premium“/„Verbessert“) sind in Safari gelistet, bleiben aber stumm →
//   Standard ist die Systemstimme für it-IT; eine bestimmte Stimme kann im Profil gewählt werden.
//   Startet eine Ansage nicht, wird automatisch ohne feste Stimme wiederholt.
// • Der Stummschalter des iPhones schaltet die Sprachausgabe in Safari stumm → Hinweis anzeigen.
import { p, save } from './state.js';

const synth = window.speechSynthesis;
let italianVoices = [];
let germanVoice = null;
let unlocked = false;
let silentStreak = 0;
let noVoiceWarned = false;

function pickVoices() {
  if (!synth) return;
  const all = synth.getVoices();
  const byLang = (prefix) => all.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
  italianVoices = byLang('it');
  germanVoice = byLang('de').find(v => v.default) || byLang('de')[0] || null;
}
if (synth) {
  pickVoices();
  synth.addEventListener?.('voiceschanged', pickVoices);
  synth.onvoiceschanged = pickVoices;
}

export const hasVoice = () => !!synth;
export const italianVoiceList = () => { pickVoices(); return italianVoices; };
export const voiceName = () => {
  const v = candidates()[0];
  return v ? `${v.name} (${v.lang})` : 'Keine italienische Stimme gefunden';
};

/** Erste Berührung irgendwo in der App „entsperrt“ die Sprachausgabe auf iOS. */
function unlock() {
  if (unlocked || !synth) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    u.lang = 'it-IT';
    synth.speak(u);
  } catch { /* egal */ }
}
window.addEventListener('pointerdown', unlock, { capture: true, once: true });
window.addEventListener('touchend', unlock, { capture: true, once: true });

const PREMIUM = /premium|enhanced|verbessert|erweitert|siri/i;
const badVoices = new Set(JSON.parse(localStorage.getItem('parla.badVoices') || '[]'));
const isItalian = (v) => v.lang.replace('_', '-').toLowerCase().startsWith('it');

/**
 * Italienische Stimmen in sinnvoller Reihenfolge. iOS ignoriert u.lang ohne feste Stimme und liest
 * dann mit der deutschen Standardstimme vor – deshalb immer eine italienische Stimme setzen.
 */
function candidates() {
  const rank = (v) =>
    (v.voiceURI === p.voiceURI ? -100 : 0) +
    (v.voiceURI === localStorage.getItem('parla.goodVoice') ? -50 : 0) +
    (badVoices.has(v.voiceURI) ? 100 : 0) +
    (PREMIUM.test(v.name) ? 10 : 0) +
    (v.lang.replace('_', '-') === 'it-IT' ? 0 : 2) +
    (v.localService ? 0 : 1);
  return [...italianVoices].sort((a, b) => rank(a) - rank(b));
}

function utterance(text, { lang = 'it', slow = false, speaker = 0, voice } = {}) {
  const u = new SpeechSynthesisUtterance(text);
  if (lang === 'de') {
    u.lang = 'de-DE';
    if (germanVoice) u.voice = germanVoice;
    u.rate = 1;
    return u;
  }
  u.lang = 'it-IT';
  if (voice) u.voice = voice;
  if (speaker) u.pitch = 1.25;
  u.rate = slow ? Math.max(0.5, p.speechRate * 0.65) : p.speechRate;
  return u;
}

/** Spricht eine Äußerung; startet sie nicht, wird die nächste italienische Stimme probiert. */
function say(text, opts, { onend } = {}) {
  if (!italianVoices.length) pickVoices();
  const list = opts.lang === 'de' ? [null] : candidates();
  if (!list.length) {
    list.push(null);
    if (opts.lang !== 'de' && !noVoiceWarned) { noVoiceWarned = true; window.dispatchEvent(new CustomEvent('parla:novoice')); }
  }
  let attempt = 0;
  let finished = false;
  const finish = () => { if (!finished) { finished = true; onend?.(); } };

  function tryVoice() {
    const voice = list[attempt];
    let started = false;
    const u = utterance(text, { ...opts, voice });
    u.onstart = () => {
      started = true;
      silentStreak = 0;
      if (voice) localStorage.setItem('parla.goodVoice', voice.voiceURI);
    };
    u.onend = () => { started = true; finish(); };
    u.onerror = (e) => { if (e.error !== 'interrupted' && e.error !== 'canceled' && !started) next(); };
    let moved = false;
    function next() {
      if (moved || finished) return;
      moved = true;
      if (voice && voice.voiceURI !== p.voiceURI) {
        badVoices.add(voice.voiceURI);
        localStorage.setItem('parla.badVoices', JSON.stringify([...badVoices]));
      }
      attempt++;
      if (attempt < Math.min(list.length, 4)) { synth.cancel(); tryVoice(); }
      else { notifySilent(); finish(); }
    }
    if (synth.paused) synth.resume();
    synth.speak(u);
    setTimeout(() => { if (!started && !synth.speaking) next(); }, 1500);
  }
  tryVoice();
}

export function resetVoiceMemory() {
  badVoices.clear();
  localStorage.removeItem('parla.badVoices');
  localStorage.removeItem('parla.goodVoice');
}

function notifySilent() {
  silentStreak++;
  if (silentStreak === 1 || silentStreak % 5 === 0) {
    window.dispatchEvent(new CustomEvent('parla:silent'));
  }
}

/** Liest einen Text vor – synchron, damit iOS es als Reaktion auf das Antippen erlaubt. */
export function speak(text, slow = false, opts = {}) {
  if (!synth || !text) return;
  if (synth.speaking || synth.pending) synth.cancel();
  say(text, { slow, ...opts });
}

/** Liest nur vor, wenn Hörübungen aktiviert sind. */
export function autoSpeak(text) {
  if (p.listening) speak(text);
}

export function stopSpeaking() {
  synth?.cancel();
}

export function setVoice(uri) {
  p.voiceURI = uri || '';
  if (uri) { badVoices.delete(uri); localStorage.setItem('parla.badVoices', JSON.stringify([...badVoices])); }
  save();
}

/**
 * Spielt eine Folge von Schritten ab: { text, lang, speaker, slow, pause (ms danach) }.
 */
export function playSequence(steps, { onStep, onDone } = {}) {
  let index = 0, stopped = false, paused = false, timer = null;
  const next = () => {
    if (stopped || paused) return;
    if (index >= steps.length) { onDone?.(); return; }
    const step = steps[index];
    onStep?.(index, step);
    const done = () => {
      if (stopped) return;
      index++;
      timer = setTimeout(next, step.pause ?? 400);
    };
    if (!step.text || !synth) { done(); return; }
    say(step.text, step, { onend: done });
  };
  stopSpeaking();
  next();
  return {
    stop() { stopped = true; clearTimeout(timer); stopSpeaking(); },
    pause() { paused = true; clearTimeout(timer); stopSpeaking(); },
    resume() { if (!paused) return; paused = false; next(); },
    get paused() { return paused; },
    get index() { return index; },
  };
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const recognitionSupported = !!Recognition;

/**
 * Startet eine Aufnahme. Liefert ein Objekt mit stop().
 * Callbacks: onText(teilTranskript), onEnd(finalesTranskript), onError(meldung)
 */
export function listen({ onText, onEnd, onError }) {
  if (!Recognition) {
    onError?.('Spracherkennung wird von diesem Browser nicht unterstützt.');
    return { stop() {} };
  }
  stopSpeaking();
  const rec = new Recognition();
  rec.lang = 'it-IT';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let transcript = '';
  let ended = false;

  rec.onresult = (event) => {
    transcript = Array.from(event.results).map(r => r[0].transcript).join(' ');
    onText?.(transcript);
  };
  rec.onerror = (event) => {
    const messages = {
      'not-allowed': 'Bitte erlaube Mikrofon und Spracherkennung (iPhone-Einstellungen › Safari › Mikrofon).',
      'service-not-allowed': 'Spracherkennung ist hier nicht erlaubt. Tipp: Diktierfunktion in den iPhone-Einstellungen (Allgemein › Tastatur) aktivieren oder die Seite einmal direkt in Safari öffnen.',
      'no-speech': 'Ich habe nichts gehört – versuch es nochmal.',
      'audio-capture': 'Kein Mikrofon gefunden.',
      'network': 'Für die Spracherkennung wird eine Internetverbindung benötigt.',
    };
    onError?.(messages[event.error] || `Fehler bei der Spracherkennung (${event.error}).`);
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    onEnd?.(transcript);
  };
  try {
    rec.start();
  } catch {
    onError?.('Aufnahme konnte nicht gestartet werden.');
  }
  return { stop() { try { rec.stop(); } catch { /* schon beendet */ } } };
}
