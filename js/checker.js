// Antwortprüfung: streng bei Grammatik (Endungen, Akzente mit Bedeutung), tolerant bei
// Satzzeichen, Groß/Klein, Subjektpronomen und echten Tippfehlern im Wortstamm.

const PUNCT = /[.,!?¡¿;:"«»“”()–\-…]/g;

/** Alle Wörter, die im Kurs vorkommen – ein „Tippfehler“, der selbst ein echtes Wort ist, zählt als Fehler. */
let lexicon = new Set();
export function setLexicon(words) { lexicon = words; }

export function normalize(text) {
  return text.toLowerCase()
    .replace(/[’`´]/g, "'")
    .replace(PUNCT, ' ')
    .split(/\s+/).filter(Boolean).join(' ');
}

export const fold = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const words = (text) => normalize(text).split(' ').filter(Boolean);

export function levenshtein(a, b) {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// ── Subjektpronomen ─────────────────────────
// Im Italienischen meist optional: „(Lei) è italiana“, „Dove abiti (tu)?“
const PRONOUNS = new Set(['io', 'tu', 'lui', 'lei', 'noi', 'voi', 'loro']);
// Vor diesen Wörtern ist ein Pronomen am Satzende kein Subjekt („con lui“, „il loro“).
const NOT_SUBJECT_BEFORE = new Set(['a', 'di', 'da', 'in', 'su', 'con', 'per', 'tra', 'fra', 'senza', 'come', 'che', 'di', 'il', 'la', 'i', 'le', 'anche', 'neanche', 'nemmeno', 'pure', 'e', 'o', 'tranne', 'verso', 'dietro', 'contro', 'secondo']);

function stripPronouns(ws) {
  const out = [...ws];
  const removed = [];
  if (out.length > 1 && PRONOUNS.has(out[0])) removed.push(out.shift());
  const last = out.length - 1;
  if (out.length > 1 && PRONOUNS.has(out[last]) && !NOT_SUBJECT_BEFORE.has(out[last - 1])) removed.push(out.pop());
  return { words: out, removed };
}

// Akzente, die die Bedeutung ändern: è (ist) / e (und), dà / da, là / la, sì / si, né / ne, tè / te, lì / li
const MEANINGFUL_ACCENTS = new Set(['è', 'e', 'dà', 'da', 'là', 'la', 'sì', 'si', 'né', 'ne', 'tè', 'te', 'lì', 'li']);

function isEndingChange(a, b) {
  // Unterschied in den letzten zwei Buchstaben → Endung (Genus, Numerus, Person, Zeit) → kein Tippfehler
  return a.slice(-2) !== b.slice(-2);
}

/**
 * Vergleicht Eingabe und eine Lösung Wort für Wort.
 * @returns {'correct'|'accent'|'typo'|'wrong'}
 */
function compareWords(given, expected) {
  if (given.length !== expected.length) return 'wrong';
  let accent = false, typos = 0;
  for (let i = 0; i < given.length; i++) {
    const g = given[i], e = expected[i];
    if (g === e) continue;
    if (fold(g) === fold(e)) {
      if (MEANINGFUL_ACCENTS.has(g) || MEANINGFUL_ACCENTS.has(e)) return 'wrong';
      accent = true;
      continue;
    }
    const fg = fold(g), fe = fold(e);
    const isTypo = fe.length >= 5
      && levenshtein(fg, fe) === 1
      && !isEndingChange(fg, fe)
      && !lexicon.has(fg);
    if (!isTypo) return 'wrong';
    typos++;
  }
  const maxTypos = expected.length >= 6 ? 2 : 1;
  if (typos > maxTypos) return 'wrong';
  return typos ? 'typo' : accent ? 'accent' : 'correct';
}

function compareAnswer(input, answer) {
  const g = words(input), e = words(answer);
  const direct = compareWords(g, e);
  if (direct !== 'wrong') return direct;
  // Subjektpronomen auf beiden Seiten optional – aber kein *anderes* Pronomen als in der Lösung.
  const sg = stripPronouns(g), se = stripPronouns(e);
  if (sg.removed.some(p => se.removed.length && !se.removed.includes(p))) return 'wrong';
  return compareWords(sg.words, se.words);
}

const RANK = { correct: 3, accent: 2, typo: 1, wrong: 0 };

/** @returns {{verdict: 'correct'|'accent'|'typo'|'wrong', answer: string}} */
export function check(input, answers) {
  if (!normalize(input)) return { verdict: 'wrong', answer: answers[0] };
  let best = { verdict: 'wrong', answer: answers[0] };
  for (const answer of answers) {
    const verdict = compareAnswer(input, answer);
    if (RANK[verdict] > RANK[best.verdict]) best = { verdict, answer };
    if (verdict === 'correct') break;
  }
  if (best.verdict === 'wrong') best.answer = closestAnswer(input, answers);
  return best;
}

function closestAnswer(input, answers) {
  const g = fold(normalize(input));
  return answers.reduce((best, a) => (levenshtein(fold(normalize(a)), g) < levenshtein(fold(normalize(best)), g) ? a : best), answers[0]);
}

/**
 * Wortweiser Vergleich für das Feedback: welche eingegebenen Wörter falsch sind und welche
 * Wörter der Lösung fehlen. @returns {{given: {w, ok}[], expected: {w, ok}[]}}
 */
export function diffWords(input, answer) {
  const g = input.trim().split(/\s+/).filter(Boolean);
  const e = answer.trim().split(/\s+/).filter(Boolean);
  const key = (w) => fold(normalize(w));
  // LCS-Tabelle
  const dp = Array.from({ length: g.length + 1 }, () => new Array(e.length + 1).fill(0));
  for (let i = g.length - 1; i >= 0; i--) {
    for (let j = e.length - 1; j >= 0; j--) {
      dp[i][j] = key(g[i]) === key(e[j]) && normalize(g[i]) === normalize(e[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const gOk = new Array(g.length).fill(false), eOk = new Array(e.length).fill(false);
  let i = 0, j = 0;
  while (i < g.length && j < e.length) {
    if (key(g[i]) === key(e[j]) && normalize(g[i]) === normalize(e[j])) { gOk[i] = eOk[j] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { given: g.map((w, k) => ({ w, ok: gOk[k] })), expected: e.map((w, k) => ({ w, ok: eOk[k] })) };
}

// ── Sprechen ─────────────────────────────────

const UNITS = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

export function numberToItalian(n) {
  if (n < 20) return UNITS[n];
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    let base = TENS[t];
    if (u === 1 || u === 8) base = base.slice(0, -1);
    return base + (u ? (u === 3 ? 'tré' : UNITS[u]) : '');
  }
  if (n < 1000) {
    const h = Math.floor(n / 100), rest = n % 100;
    return (h === 1 ? 'cento' : UNITS[h] + 'cento') + (rest ? numberToItalian(rest) : '');
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000), rest = n % 1000;
    return (k === 1 ? 'mille' : numberToItalian(k) + 'mila') + (rest ? numberToItalian(rest) : '');
  }
  return String(n);
}

/** Wandelt Ziffern, Uhrzeiten und € aus der Spracherkennung in Wörter um. */
export function spellNumbers(text) {
  return text
    .replace(/(\d{1,2})[:.](30)\b/g, (_, h) => `${numberToItalian(+h)} e mezza`)
    .replace(/(\d{1,2})[:.](15)\b/g, (_, h) => `${numberToItalian(+h)} e un quarto`)
    .replace(/(\d{1,2})[:.](\d{2})\b/g, (_, h, m) => `${numberToItalian(+h)} e ${numberToItalian(+m)}`)
    .replace(/€/g, ' euro ')
    .replace(/\d+/g, (d) => numberToItalian(+d));
}

/** Anteil der Zielwörter, die in der Spracherkennung vorkommen (0…1). */
export function speechScore(transcript, target) {
  const targetWords = fold(normalize(spellNumbers(target))).split(' ').filter(Boolean);
  const spoken = fold(normalize(spellNumbers(transcript))).split(' ').filter(Boolean);
  if (!targetWords.length) return 0;
  let hits = 0;
  for (const word of targetWords) {
    const i = spoken.findIndex(s => s === word || (word.length > 4 && levenshtein(s, word) <= 1));
    if (i >= 0) { hits++; spoken.splice(i, 1); }
  }
  return hits / targetWords.length;
}

/** Zerlegt einen Satz in Wortbank-Kacheln (ohne Satzzeichen). */
export function tokens(sentence) {
  return sentence.split(' ').map(t => t.replace(/^[.,!?;:"«»“”]+|[.,!?;:"«»“”]+$/g, '')).filter(Boolean);
}
