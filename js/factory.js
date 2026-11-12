// Erzeugt aus den Kursinhalten abwechslungsreiche Übungsfolgen.
import { Course, LEVELS, unitsFor, sentenceKey, clozeKey } from './course.js';
import { tokens, normalize } from './checker.js';
import { shuffle, sample } from './ui.js';

let counter = 0;
const ex = (type, data, extra = {}) => ({ type, data, vocabId: null, itemKey: null, attempt: 0, id: `e${++counter}`, ...extra });
export const isSpeaking = (e) => e.type === 'speak';
export const isListening = (e) => e.type === 'listenChoice' || (e.type === 'typing' && e.data.dictation);
export const isInfo = (e) => ['introduce', 'grammarCard', 'dialogue'].includes(e.type);

// ── Lektionen ────────────────────────────────

export function makeLesson(lesson, opts) {
  const unit = Course.unitById.get(lesson.unitId);
  switch (lesson.kind) {
    case 'vocabulary': return vocabularyLesson(unit.vocab, vocabPool(unit), opts);
    case 'grammar': return grammarLesson(unit);
    case 'sentences': return sentenceLesson(unit, opts);
    case 'dialogue': return dialogueLesson(unit, opts);
    default: return masteryLesson(unit, opts);
  }
}

export function vocabularyLesson(words, pool, o) {
  const result = [];
  const seen = [];
  for (let start = 0; start < words.length; start += 3) {
    const chunk = words.slice(start, start + 3);
    chunk.forEach(w => result.push(ex('introduce', w, { vocabId: w.it })));
    seen.push(...chunk);
    chunk.forEach((w, i) => {
      if (i === 0) result.push(choiceItToDe(w, pool));
      else if (i === 1) result.push(o.listening ? listenWord(w, pool) : choiceDeToIt(w, pool));
      else result.push(choiceDeToIt(w, pool));
    });
    if (seen.length >= 4) result.push(ex('match', seen.slice(-5)));
  }
  shuffle(words).slice(0, 2).forEach(w => result.push(typeWord(w)));
  return result;
}

function grammarLesson(unit) {
  const result = [ex('grammarCard', unit.grammar)];
  const cloze = shuffle(unit.cloze).map(clozeEx);
  unit.grammar.examples.forEach((s, i) => cloze.splice(Math.min(cloze.length, 2 + i * 3), 0, wordBank(s, unit)));
  result.push(...cloze);
  if (unit.sentences.length) result.push(typeSentence(sample(unit.sentences)));
  return result;
}

function sentenceLesson(unit, o) {
  const result = unit.sentences.map((s, i) => {
    switch (i % 4) {
      case 0: return wordBank(s, unit);
      case 1: return typeSentence(s);
      case 2: return o.listening ? dictation(s) : sentenceChoice(s, unit);
      default: return sentenceChoice(s, unit);
    }
  });
  if (o.speaking) {
    // erst nachsprechen, dann aus dem Gedächtnis
    shuffle(unit.sentences).slice(0, 3).forEach((s, i) =>
      result.splice(Math.min(result.length, 2 + i * 3), 0, speakEx(s, i > 0)));
  }
  result.push(wordBank(sample(unit.sentences), unit));
  return result;
}

function dialogueLesson(unit, o) {
  const d = unit.dialogue;
  const result = [ex('dialogue', d)];
  d.questions.forEach(q => result.push(ex('choice', {
    instruction: 'Verständnisfrage', prompt: q.q, speech: null, options: shuffle(q.options), answer: q.answer,
  })));
  // Zeilen der Gesprächspartnerin/des Gesprächspartners nachbauen und sprechen
  const lines = shuffle(d.lines.filter(l => tokens(l.it).length >= 3 && tokens(l.it).length <= 10)).slice(0, 3);
  lines.forEach((l, i) => {
    const s = { it: l.it, de: l.de, alt: [] };
    if (i === 2 && o.speaking) result.push(speakEx(s, true));
    else result.push(wordBank(s, unit, d.lines.map(x => ({ it: x.it }))));
  });
  return result;
}

function masteryLesson(unit, o) {
  const pool = vocabPool(unit);
  const sentences = shuffle(unit.sentences);
  let result = [
    ...shuffle(unit.vocab).slice(0, 3).map(typeWord),
    ...shuffle(unit.cloze).slice(0, 3).map(clozeEx),
    ...sentences.slice(0, 2).map(s => wordBank(s, unit)),
  ];
  if (sentences[2]) result.push(typeSentence(sentences[2]));
  if (sentences[3]) result.push(o.listening ? dictation(sentences[3]) : sentenceChoice(sentences[3], unit));
  if (o.speaking && sentences[4]) result.push(speakEx(sentences[4], true));
  result.push(choiceDeToIt(sample(unit.vocab), pool));
  result = shuffle(result);
  result.push(ex('match', shuffle(unit.vocab).slice(0, 5)));
  return result;
}

// ── Freies Training ──────────────────────────

export function vocabReview(words, o) {
  const list = shuffle(words).slice(0, 12);
  const pool = Course.allVocab;
  const result = list.map((w, i) => {
    switch (i % 4) {
      case 0: return choiceDeToIt(w, pool);
      case 1: return typeWord(w);
      case 2: return o.listening ? listenWord(w, pool) : choiceItToDe(w, pool);
      default: return choiceItToDe(w, pool);
    }
  });
  if (list.length >= 4) result.splice(Math.min(4, result.length), 0, ex('match', list.slice(0, 5)));
  return result;
}

/** Tägliche Wiederholung: fällige Wörter + fällige Sätze/Lückentexte gemischt. */
export function dailyReview(words, items, o) {
  const vocab = vocabReview(shuffle(words).slice(0, 8), o);
  const rest = shuffle(items).slice(0, 8).map(({ kind, unit, item }, i) => {
    if (kind === 'cloze') return clozeEx(item);
    return i % 2 ? typeSentence(item) : wordBank(item, unit);
  });
  return shuffle([...vocab, ...rest]);
}

export function deckLesson(deck, learnedIds, o) {
  const fresh = deck.words.filter(w => !learnedIds.has(w.it)).slice(0, 6);
  const pool = [...deck.words, ...Course.allVocab.slice(0, 200)];
  if (fresh.length) return vocabularyLesson(fresh, pool, o);
  return vocabReview(deck.words, o);
}

export function listeningTraining(units) {
  const sentences = shuffle(units.flatMap(u => u.sentences)).slice(0, 6).map(dictation);
  const words = shuffle(units.flatMap(u => u.vocab)).slice(0, 4).map(w => listenWord(w, Course.allVocab));
  return shuffle([...sentences, ...words]);
}

export function speakingTraining(units) {
  return shuffle(units.flatMap(u => [...u.sentences, ...u.grammar.examples])).slice(0, 8).map(s => speakEx(s, true));
}

export function grammarDrill(units) {
  return shuffle(units.flatMap(u => u.cloze)).slice(0, 12).map(clozeEx);
}

/** Sätze für den freihändigen Audio-Modus. */
export function audioItems(units, count = 20) {
  const pool = units.flatMap(u => [...u.sentences, ...(u.dialogue?.lines || []).map(l => ({ it: l.it, de: l.de }))]);
  return shuffle(pool).slice(0, count);
}

/** Einstufungstest: 3 Fragen je Niveau. */
export function placementQuestions() {
  return LEVELS.flatMap(level => shuffle(unitsFor(level)).slice(0, 3).map(u => ({ level, cloze: sample(u.cloze) })));
}

// ── Bausteine ────────────────────────────────

const vocabPool = (unit) => [...unit.vocab, ...unitsFor(unit.level).flatMap(u => u.vocab)];

/** Teilbedeutungen („lernen / studieren“ → ['lernen', 'studieren']) für den Überschneidungs-Check. */
const meanings = (de) => de.toLowerCase().replace(/\(.*?\)/g, '').split(/[\/,;]/).map(s => s.replace(/^(der|die|das|ein|eine|sich) /, '').trim()).filter(Boolean);
const overlaps = (a, b) => { const mb = meanings(b); return meanings(a).some(m => mb.includes(m)); };

/** Ablenker, die weder gleich lauten noch dieselbe Bedeutung haben. */
function distractors(target, pool, key, count = 3) {
  const result = [];
  const seenKeys = new Set([key(target).toLowerCase()]);
  for (const item of shuffle(pool)) {
    const k = key(item).toLowerCase();
    if (seenKeys.has(k) || overlaps(item.de, target.de) || normalize(item.it) === normalize(target.it)) continue;
    if (result.some(r => overlaps(r.de, item.de))) continue;
    seenKeys.add(k);
    result.push(item);
    if (result.length === count) break;
  }
  return result.map(key);
}

function choiceItToDe(w, pool) {
  return ex('choice', { instruction: 'Was bedeutet …?', prompt: w.it, speech: w.it,
    options: shuffle([...distractors(w, pool, v => v.de), w.de]), answer: w.de }, { vocabId: w.it });
}

function choiceDeToIt(w, pool) {
  return ex('choice', { instruction: 'Wie sagt man auf Italienisch …?', prompt: w.de, speech: null,
    options: shuffle([...distractors(w, pool, v => v.it), w.it]), answer: w.it, italianOptions: true }, { vocabId: w.it });
}

function listenWord(w, pool) {
  // Optionen werden beim Antippen NICHT vorgelesen – sonst könnte man einfach Klänge vergleichen.
  return ex('listenChoice', { instruction: 'Was hörst du?', prompt: '', speech: w.it,
    options: shuffle([...distractors(w, pool, v => v.it), w.it]), answer: w.it }, { vocabId: w.it });
}

function typeWord(w) {
  return ex('typing', { instruction: 'Schreibe auf Italienisch', prompt: w.de, answers: [w.it], speech: null, dictation: false }, { vocabId: w.it });
}

function typeSentence(s) {
  return ex('typing', { instruction: 'Übersetze ins Italienische', prompt: s.de, answers: acceptedAnswers(s), speech: null, dictation: false },
    { itemKey: sentenceKey(s) });
}

function dictation(s) {
  return ex('typing', { instruction: 'Schreibe, was du hörst', prompt: s.de, answers: [s.it], speech: s.it, dictation: true });
}

function clozeEx(c) {
  return ex('cloze', c, { itemKey: clozeKey(c) });
}

function speakEx(s, memory) {
  return ex('speak', { ...s, memory });
}

function sentenceChoice(s, unit) {
  const pool = unitsFor(unit.level).flatMap(u => u.sentences);
  const options = [s.de];
  for (const x of shuffle(pool)) {
    if (options.length === 4) break;
    if (!options.includes(x.de) && normalize(x.it) !== normalize(s.it)) options.push(x.de);
  }
  return ex('choice', { instruction: 'Was bedeutet dieser Satz?', prompt: s.it, speech: s.it, options: shuffle(options), answer: s.de });
}

function wordBank(s, unit, extraSource = unit.sentences) {
  const toks = tokens(s.it);
  const used = new Set(toks.map(t => t.toLowerCase()));
  const seen = new Set();
  const extra = extraSource.flatMap(x => tokens(x.it))
    .filter(t => !used.has(t.toLowerCase()) && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  return ex('wordBank', { prompt: s.de, bank: shuffle([...toks, ...shuffle(extra).slice(0, 3)]), answers: acceptedAnswers(s), italian: s.it },
    { itemKey: s.alt !== undefined && Course.items.has(sentenceKey(s)) ? sentenceKey(s) : null });
}

/** Lösung + Varianten. (Subjektpronomen behandelt die Antwortprüfung selbst.) */
export const acceptedAnswers = (s) => [s.it, ...(s.alt || [])];
