// Kursstruktur: Einheiten → Lektionen (Vokabeln, Grammatik, Sätze, [Dialog], Meisterprüfung) + Wortschatz-Pakete.
import { setLexicon, normalize, fold, tokens } from './checker.js';

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

export const LEVEL_INFO = {
  A1: { name: 'Anfänger', color: '#00894b', summary: 'Ich kann noch (fast) kein Italienisch.' },
  A2: { name: 'Grundlagen', color: '#008a8a', summary: 'Ich kann mich vorstellen und einfache Sätze bilden.' },
  B1: { name: 'Mittelstufe', color: '#1a7fd6', summary: 'Ich komme im Urlaub zurecht und kann von Vergangenem erzählen.' },
  B2: { name: 'Selbstständig', color: '#5c59d9', summary: 'Ich kann meine Meinung sagen und Gesprächen gut folgen.' },
  C1: { name: 'Fließend', color: '#9442cf', summary: 'Ich spreche sicher und will an Feinheiten arbeiten.' },
};

export const KINDS = ['vocabulary', 'grammar', 'sentences', 'dialogue', 'mastery'];

export const KIND_INFO = {
  vocabulary: { title: 'Vokabeln', short: 'Wörter', icon: '📖' },
  grammar: { title: 'Grammatik', short: 'Grammatik', icon: '🧩' },
  sentences: { title: 'Sätze & Sprechen', short: 'Sätze', icon: '💬' },
  dialogue: { title: 'Dialog', short: 'Dialog', icon: '🎭' },
  mastery: { title: 'Meisterprüfung', short: 'Test', icon: '👑' },
};

/** Mindest-Trefferquote (beim ersten Versuch), damit eine Lektion als bestanden gilt. */
export const PASS_THRESHOLD = { vocabulary: 0.6, grammar: 0.6, sentences: 0.6, dialogue: 0.6, mastery: 0.75 };

export const Course = {
  units: [],
  lessons: [],
  decks: [],
  unitById: new Map(),
  deckById: new Map(),
  allVocab: [],
  vocabById: new Map(),
  /** Schlüssel → { kind: 'sentence'|'cloze', unit, item } für die Wiederholung */
  items: new Map(),
};

export const sentenceKey = (s) => 's:' + s.it;
export const clozeKey = (c) => 'c:' + c.text;

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export async function loadCourse() {
  const [data, deckData] = await Promise.all([
    fetchJSON('data/course.json'),
    fetchJSON('data/decks.json').catch(() => ({ decks: [] })),
  ]);
  Course.units = data.units.map(u => ({ ...u, emoji: u.emoji || '📘', grammar: { ...u.grammar, id: `${u.id}.grammar`, level: u.level } }));
  Course.decks = deckData.decks || [];
  Course.lessons = [];
  const lexicon = new Set();
  const addWords = (text) => { for (const w of normalize(text).split(' ')) if (w) lexicon.add(fold(w)); };

  const addVocab = (word, source) => {
    addWords(word.it);
    if (!Course.vocabById.has(word.it)) {
      Course.vocabById.set(word.it, { ...word, source });
      Course.allVocab.push(word);
    }
  };

  for (const unit of Course.units) {
    Course.unitById.set(unit.id, unit);
    for (const kind of KINDS) {
      if (kind === 'dialogue' && !unit.dialogue) continue;
      Course.lessons.push({ id: `${unit.id}.${kind}`, unitId: unit.id, kind, index: Course.lessons.length });
    }
    unit.vocab.forEach(w => addVocab(w, unit.id));
    for (const s of [...unit.sentences, ...unit.grammar.examples]) {
      [s.it, ...(s.alt || [])].forEach(addWords);
      Course.items.set(sentenceKey(s), { kind: 'sentence', unit, item: s });
    }
    for (const c of unit.cloze) {
      [c.text.replace('___', ''), c.answer, ...c.wrong].forEach(addWords);
      Course.items.set(clozeKey(c), { kind: 'cloze', unit, item: c });
    }
    unit.dialogue?.lines.forEach(l => addWords(l.it));
  }
  for (const deck of Course.decks) {
    Course.deckById.set(deck.id, deck);
    deck.words.forEach(w => addVocab(w, deck.id));
  }
  setLexicon(lexicon);
}

export const levelIndex = (level) => LEVELS.indexOf(level);
export const unitsFor = (level) => Course.units.filter(u => u.level === level);
export const decksFor = (level) => Course.decks.filter(d => d.level === level);
export const lessonsFor = (unit) => Course.lessons.filter(l => l.unitId === unit.id);
export const unitOf = (lesson) => Course.unitById.get(lesson.unitId);
export const firstLessonIndex = (level) => Course.lessons.find(l => unitOf(l).level === level)?.index ?? 0;
export { tokens };
