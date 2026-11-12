// Fortschritt, Serie, XP und Spaced Repetition – gespeichert im Browser (localStorage).
import { Course, firstLessonIndex, levelIndex, lessonsFor, unitOf, unitsFor } from './course.js';

const KEY = 'parla.progress.v1';
const DAY = 86_400_000;
/** Wiederholungsabstände in Tagen pro Leitner-Box. */
export const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, 60, 120];

const defaults = () => ({
  hasOnboarded: false,
  startLevel: 'A1',
  dailyGoal: 20,
  xp: 0,
  xpByDay: {},
  streak: 0,
  longestStreak: 0,
  lastActiveDay: null,
  completed: [],
  accuracy: {},
  srs: {},
  items: {},
  listening: true,
  speaking: true,
  sounds: true,
  speechRate: 0.9,
  voiceURI: '',
  totalCorrect: 0,
  totalAnswers: 0,
  lastBackup: null,
  createdAt: Date.now(),
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Macht beliebige (auch kaputte) Daten zu einem gültigen Fortschritt. */
export function sanitize(data) {
  const base = defaults();
  if (!isObj(data)) return base;
  const out = { ...base };
  for (const [key, def] of Object.entries(base)) {
    const v = data[key];
    if (v === undefined) continue;
    if (Array.isArray(def)) out[key] = Array.isArray(v) ? v.filter(x => typeof x === 'string') : def;
    else if (isObj(def) || (def === null && isObj(v))) out[key] = isObj(v) ? v : def;
    else if (def === null) out[key] = typeof v === 'string' || typeof v === 'number' ? v : null;
    else out[key] = typeof v === typeof def ? v : def;
  }
  if (!['A1', 'A2', 'B1', 'B2', 'C1'].includes(out.startLevel)) out.startLevel = 'A1';
  for (const field of ['srs', 'items']) {
    const clean = {};
    for (const [id, c] of Object.entries(out[field])) {
      if (isObj(c) && Number.isFinite(c.box) && Number.isFinite(c.due)) {
        clean[id] = { box: Math.max(0, Math.min(SRS_INTERVALS.length - 1, c.box | 0)), due: c.due, correct: +c.correct || 0, wrong: +c.wrong || 0, lastUp: c.lastUp || null, lastWrong: c.lastWrong || null };
      }
    }
    out[field] = clean;
  }
  for (const k of Object.keys(out.xpByDay)) if (!Number.isFinite(out.xpByDay[k])) delete out.xpByDay[k];
  return out;
}

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return defaults();
  }
}

export const p = load();
let completedSet = new Set(p.completed);

export function save() {
  p.completed = [...completedSet];
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* Speicher voll */ }
}

export function replaceProgress(data) {
  const clean = sanitize(data);
  for (const k of Object.keys(p)) delete p[k];
  Object.assign(p, clean);
  completedSet = new Set(p.completed);
  save();
}

export function reset() { replaceProgress({}); sessionStorage.clear(); }

export function exportProgress() {
  p.lastBackup = Date.now();
  save();
  return JSON.stringify(p, null, 1);
}

/** Bittet den Browser, den Speicher nicht automatisch zu löschen. */
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* egal */ }
}

export function needsBackupReminder() {
  const since = p.lastBackup || p.createdAt;
  return p.xp >= 50 && Date.now() - since > 30 * DAY;
}

// ── Tage & Serie (nach Kalendertagen, sicher bei Zeitumstellung) ──

export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function daysAgo(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}
const yesterdayKey = () => dayKey(daysAgo(1));

export const todayXP = () => p.xpByDay[dayKey()] || 0;
export const practicedToday = () => p.lastActiveDay === dayKey();
export function currentStreak() {
  return p.lastActiveDay === dayKey() || p.lastActiveDay === yesterdayKey() ? p.streak : 0;
}

export function lastWeek() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = daysAgo(6 - i);
    return { date: d, xp: p.xpByDay[dayKey(d)] || 0 };
  });
}

export function addXP(amount) {
  const today = dayKey();
  p.xp += amount;
  p.xpByDay[today] = (p.xpByDay[today] || 0) + amount;
  if (p.lastActiveDay !== today) {
    p.streak = p.lastActiveDay === yesterdayKey() ? p.streak + 1 : 1;
    p.lastActiveDay = today;
    p.longestStreak = Math.max(p.longestStreak, p.streak);
  }
  save();
}

// ── Lektionen ────────────────────────────────

export const isCompleted = (lesson) => completedSet.has(lesson.id);

export function isUnlocked(lesson) {
  if (isCompleted(lesson)) return true;
  if (lesson.index <= firstLessonIndex(p.startLevel)) return true;
  return isCompleted(Course.lessons[lesson.index - 1]);
}

export function nextLesson() {
  const start = firstLessonIndex(p.startLevel);
  return Course.lessons.find(l => l.index >= start && !isCompleted(l)) || null;
}

export function currentLevel() {
  const next = nextLesson();
  return next ? unitOf(next).level : 'C1';
}

export function fluencyProgress() {
  const start = firstLessonIndex(p.startLevel);
  const relevant = Course.lessons.filter(l => l.index >= start);
  return relevant.length ? relevant.filter(isCompleted).length / relevant.length : 1;
}

export function levelProgress(level) {
  const lessons = unitsFor(level).flatMap(lessonsFor);
  return lessons.length ? lessons.filter(isCompleted).length / lessons.length : 0;
}

export function completeLesson(id, accuracy) {
  completedSet.add(id);
  p.accuracy[id] = Math.max(p.accuracy[id] || 0, accuracy);
  save();
}

const skippedLevel = (u) => levelIndex(u.level) < levelIndex(p.startLevel);

/** Einheiten mit mindestens einer abgeschlossenen Lektion (für Hören/Sprechen). */
export function studiedUnits() {
  return Course.units.filter(u => skippedLevel(u) || lessonsFor(u).some(isCompleted));
}

/** Einheiten, deren Grammatik-Lektion abgeschlossen ist (für den Grammatik-Drill). */
export function grammarUnits() {
  return Course.units.filter(u => skippedLevel(u) || completedSet.has(`${u.id}.grammar`));
}

// ── Spaced Repetition (Vokabeln und Sätze/Lückentexte) ──

function updateCard(store, id, correct) {
  const today = dayKey();
  const card = store[id] || { box: 0, due: Date.now(), correct: 0, wrong: 0, lastUp: null, lastWrong: null };
  if (correct) {
    card.correct++;
    // höchstens eine Stufe pro Tag – mehrfaches Üben am selben Tag zählt nicht als „gefestigt“
    if (card.lastUp !== today) {
      card.box = Math.min(card.box + 1, SRS_INTERVALS.length - 1);
      card.lastUp = today;
      card.due = Date.now() + SRS_INTERVALS[card.box] * DAY;
    }
  } else {
    card.wrong++;
    card.box = Math.max(card.box - 2, 0);
    card.lastWrong = Date.now();
    card.lastUp = today;
    card.due = Date.now() + (card.box ? SRS_INTERVALS[card.box] * DAY : 0);
  }
  store[id] = card;
  save();
}

export function introduceWord(id) {
  if (!p.srs[id]) {
    p.srs[id] = { box: 0, due: Date.now(), correct: 0, wrong: 0, lastUp: null, lastWrong: null };
    save();
  }
}

export const recordWord = (id, correct) => updateCard(p.srs, id, correct);
export const recordItem = (key, correct) => updateCard(p.items, key, correct);

export function recordAnswer(correct) {
  p.totalAnswers++;
  if (correct) p.totalCorrect++;
  save();
}

export const strength = (card) => card.box / (SRS_INTERVALS.length - 1);

export function dueWords() {
  const now = Date.now();
  return Object.entries(p.srs).filter(([, c]) => c.due <= now).map(([id]) => Course.vocabById.get(id)).filter(Boolean);
}

export function dueItems() {
  const now = Date.now();
  return Object.entries(p.items).filter(([, c]) => c.due <= now).map(([key]) => Course.items.get(key)).filter(Boolean);
}

export const dueCount = () => dueWords().length + dueItems().length;

export function learnedWords() {
  return Object.entries(p.srs)
    .map(([id, card]) => ({ word: Course.vocabById.get(id), card }))
    .filter(e => e.word)
    .sort((a, b) => a.word.it.localeCompare(b.word.it, 'it'));
}

/** Schwach = niedrige Stufe oder in den letzten 10 Tagen falsch beantwortet (und noch nicht gefestigt). */
export function weakWords() {
  const recent = Date.now() - 10 * DAY;
  return learnedWords()
    .filter(e => e.card.box < 2 || (e.card.lastWrong && e.card.lastWrong > recent && e.card.box < 4))
    .sort((a, b) => a.card.box - b.card.box)
    .map(e => e.word);
}

export function deckProgress(deck) {
  const learned = deck.words.filter(w => p.srs[w.it]).length;
  return { learned, total: deck.words.length };
}

export const options = () => ({ listening: p.listening, speaking: p.speaking });
