// Die vier Haupt-Tabs.
import { h, openSheet, speakButton } from './ui.js';
import { Course, LEVELS, LEVEL_INFO, KIND_INFO, PASS_THRESHOLD, lessonsFor, unitsFor, decksFor, unitOf, levelIndex } from './course.js';
import * as S from './state.js';
import * as F from './factory.js';
import { openLesson } from './lesson.js';
import { openAudioMode } from './audio.js';
import { grammarContent } from './exercises.js';
import { speak, voiceName, recognitionSupported, italianVoiceList, setVoice, resetVoiceMemory } from './speech.js';

const sb = (text, size = 'small') => speakButton(text, { size, onSpeak: speak });
let scrolledOnce = false;

function startLesson(lesson, rerender) {
  const unit = unitOf(lesson);
  const run = () => openLesson({
    title: `${unit.title} · ${KIND_INFO[lesson.kind].title}`,
    lessonId: lesson.id,
    color: LEVEL_INFO[unit.level].color,
    threshold: PASS_THRESHOLD[lesson.kind],
    exercises: F.makeLesson(lesson, S.options()),
    onClose: rerender,
    onRetry: run,
  });
  run();
}

function startPractice(title, color, exercises, rerender) {
  if (!exercises.length) return;
  openLesson({ title, color, exercises, onClose: rerender });
}

const showGrammar = (topic) => openSheet(grammarContent(topic));

// ════════════ LERNEN ════════════

export function learnView(rerender) {
  const next = S.nextLesson();
  const screen = h('div', { class: 'screen' },
    h('h1', { class: 'screen-title' }, 'Parla'),
    installHint(),
    backupHint(rerender),
    statsBar(),
    reviewCard(rerender),
    next ? continueCard(next, rerender) : h('div', { class: 'card bold', style: { color: 'var(--gold-t)' } }, '🏆 Kurs abgeschlossen – complimenti!'),
    fluencyCard(),
    LEVELS.map(level => levelSection(level, rerender)),
  );
  // Nur beim ersten Öffnen zur aktuellen Einheit scrollen (sonst bleibt die Übersicht oben).
  if (next && !scrolledOnce) {
    scrolledOnce = true;
    const first = Course.units.indexOf(unitOf(next)) === 0;
    if (!first) {
      requestAnimationFrame(() => setTimeout(() => {
        screen.querySelector(`[data-unit="${next.unitId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 600));
    }
  }
  return screen;
}

function installHint() {
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone || localStorage.getItem('parla.hideInstall')) return null;
  const hint = h('div', { class: 'install-hint' },
    h('div', { class: 'bold' }, '📲 Als App installieren'),
    h('div', {}, 'Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Dann startet Parla im Vollbild – wie eine echte App.'),
    h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Hinweis: Safari und die Home-Bildschirm-App speichern den Fortschritt getrennt.'),
    h('button', { class: 'btn-link', style: { textAlign: 'left', padding: '8px 0 0' }, onclick: () => { localStorage.setItem('parla.hideInstall', '1'); hint.remove(); } }, 'Ausblenden'),
  );
  return hint;
}

function backupHint(rerender) {
  if (!S.needsBackupReminder()) return null;
  return h('div', { class: 'install-hint' },
    h('div', { class: 'bold' }, '💾 Zeit für ein Backup'),
    h('div', {}, 'Dein Fortschritt liegt nur auf diesem iPhone. Sichere ihn ab und zu (z. B. in „Dateien“ oder iCloud).'),
    h('button', { class: 'btn-link', style: { textAlign: 'left', padding: '8px 0 0' }, onclick: async () => { await backup(); rerender(); } }, 'Jetzt sichern'),
  );
}

function statsBar() {
  const progress = Math.min(S.todayXP() / Math.max(S.p.dailyGoal, 1), 1);
  const pill = (icon, value, color, label) => h('div', { class: 'pill', 'aria-label': `${label}: ${value}`, style: { color, background: `color-mix(in srgb, ${color} 13%, transparent)` } }, icon, ' ', value);
  const r = 16, circ = 2 * Math.PI * r;
  const ring = h('div', { 'aria-label': `Tagesziel ${S.todayXP()} von ${S.p.dailyGoal} XP`, html: `<svg class="ring" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--card)" stroke-width="5"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--green)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - progress)}" transform="rotate(-90 20 20)"/><text x="20" y="25" text-anchor="middle" font-size="13" fill="currentColor">${progress >= 1 ? '✓' : '🎯'}</text></svg>` });
  return h('div', { class: 'row' },
    pill('🔥', S.currentStreak(), S.practicedToday() ? 'var(--orange-t)' : 'var(--muted)', 'Serie in Tagen'),
    pill('⚡️', S.p.xp, 'var(--gold-t)', 'XP'),
    h('div', { class: 'spacer' }),
    h('div', { class: 'small muted bold' }, `${S.todayXP()}/${S.p.dailyGoal} XP`),
    ring,
  );
}

function reviewCard(rerender) {
  const words = S.dueWords();
  const items = S.dueItems();
  const n = words.length + items.length;
  if (!n) return null;
  return h('button', { class: 'tile review-tile', onclick: () => startPractice('Tägliche Wiederholung', '#1a7fd6', F.dailyReview(words, items, S.options()), rerender) },
    h('div', { class: 'icon', style: { background: 'color-mix(in srgb, var(--blue) 18%, transparent)' } }, '🔁'),
    h('div', { style: { flex: 1 } },
      h('div', { class: 'bold' }, 'Tägliche Wiederholung'),
      h('div', { class: 'small muted' }, `${n} ${n === 1 ? 'Aufgabe ist' : 'Aufgaben sind'} fällig – so bleibt das Gelernte hängen`)),
    h('div', { style: { color: 'var(--blue)', fontSize: '20px' }, 'aria-hidden': 'true' }, '▶'));
}

function continueCard(lesson, rerender) {
  const unit = unitOf(lesson);
  const color = LEVEL_INFO[unit.level].color;
  return h('div', { class: 'continue-card', style: { background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, #000))`, '--accent': color } },
    h('div', { class: 'row small bold', style: { opacity: 0.9 } }, `${unit.level} · WEITERLERNEN`, h('div', { class: 'spacer' }), KIND_INFO[lesson.kind].icon),
    h('div', { style: { fontSize: '30px', fontWeight: 800 } }, `${unit.emoji} ${unit.title}`),
    h('div', { class: 'bold', style: { opacity: 0.95 } }, KIND_INFO[lesson.kind].title),
    h('button', { class: 'btn white', onclick: () => startLesson(lesson, rerender) }, 'Lektion starten'),
  );
}

function fluencyCard() {
  const level = S.currentLevel();
  const pct = S.fluencyProgress();
  const color = LEVEL_INFO[level].color;
  return h('div', { class: 'card col' },
    h('div', { class: 'row' }, h('div', { class: 'bold' }, 'Dein Weg zur Fließendheit'), h('div', { class: 'spacer' }), h('div', { class: 'bold', style: { color } }, `${Math.round(pct * 100)} %`)),
    h('div', { class: 'progress thin', role: 'progressbar', 'aria-valuenow': String(Math.round(pct * 100)) }, h('div', { style: { width: `${pct * 100}%`, background: color, minWidth: '10px' } })),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      LEVELS.map(l => h('span', { class: 'small bold', style: { color: levelIndex(l) <= levelIndex(level) ? LEVEL_INFO[l].color : 'var(--muted)' } }, l))),
  );
}

function levelSection(level, rerender) {
  const info = LEVEL_INFO[level];
  const pct = S.levelProgress(level);
  const skipped = levelIndex(level) < levelIndex(S.p.startLevel) && pct < 1;
  return h('section', { class: 'col' },
    h('div', { class: 'level-header' },
      h('span', { class: 'badge', style: { background: info.color, fontSize: '16px' } }, level),
      h('h2', {}, info.name),
      h('div', { class: 'spacer' }),
      h('span', { class: 'small muted bold' }, skipped ? 'übersprungen' : `${Math.round(pct * 100)} %`)),
    unitsFor(level).map(unit => unitCard(unit, rerender)),
  );
}

function unitCard(unit, rerender) {
  const color = LEVEL_INFO[unit.level].color;
  const lessons = lessonsFor(unit);
  const next = S.nextLesson();
  const done = lessons.every(S.isCompleted);
  return h('div', { class: 'unit-card', 'data-unit': unit.id },
    h('div', { class: 'row', style: { gap: '14px' } },
      h('div', { class: 'unit-icon', 'aria-hidden': 'true', style: { background: `color-mix(in srgb, ${color} 18%, transparent)` } }, unit.emoji),
      h('div', { style: { flex: 1 } }, h('h3', { class: 'unit-title' }, unit.title), h('div', { class: 'small muted' }, unit.subtitle)),
      h('button', { class: 'icon-btn', style: { color, fontSize: '22px' }, 'aria-label': `Grammatik: ${unit.grammar.title}`, onclick: () => showGrammar(unit.grammar) }, '📘'),
    ),
    h('div', { class: 'nodes' }, lessons.map(lesson => {
      const completed = S.isCompleted(lesson);
      const unlocked = S.isUnlocked(lesson);
      const cls = ['node', completed ? 'completed' : '', unlocked ? 'unlocked' : 'locked', next?.id === lesson.id ? 'next' : ''].join(' ');
      return h('button', {
        class: cls, style: { '--lc': color }, disabled: !unlocked,
        'aria-label': `${KIND_INFO[lesson.kind].title}${completed ? ', abgeschlossen' : unlocked ? '' : ', gesperrt'}`,
        onclick: () => startLesson(lesson, rerender),
      },
        h('div', { class: 'node-circle', 'aria-hidden': 'true' }, completed ? '✓' : unlocked ? KIND_INFO[lesson.kind].icon : '🔒'),
        h('span', { 'aria-hidden': 'true' }, KIND_INFO[lesson.kind].short));
    })),
    done ? h('div', { class: 'small bold', style: { color } }, '✅ Einheit gemeistert') : null,
  );
}

// ════════════ ÜBEN ════════════

export function practiceView(rerender) {
  const studied = S.studiedUnits();
  const grammar = S.grammarUnits();
  const due = S.dueWords();
  const items = S.dueItems();
  const weak = S.weakWords();
  const start = (title, color, exercises) => startPractice(title, color, exercises, rerender);
  const tile = (title, subtitle, icon, color, enabled, onClick) => h('button', { class: `tile ${enabled ? '' : 'disabled'}`, onclick: onClick, disabled: !enabled },
    h('div', { class: 'icon', 'aria-hidden': 'true', style: { background: `color-mix(in srgb, ${color} 18%, transparent)` } }, icon),
    h('div', { style: { flex: 1 } }, h('div', { class: 'bold' }, title), h('div', { class: 'small muted' }, subtitle)),
    h('div', { style: { color, fontSize: '20px' }, 'aria-hidden': 'true' }, '▶'));

  return h('div', { class: 'screen' },
    h('h1', { class: 'screen-title' }, 'Üben'),
    !studied.length && !S.learnedWords().length
      ? h('div', { class: 'card muted' }, 'ℹ️ Schließe deine erste Lektion ab, dann findest du hier persönliche Trainings. Die Wortschatz-Pakete unten kannst du sofort nutzen.') : null,
    tile('Tägliche Wiederholung', due.length + items.length ? `${due.length} Wörter, ${items.length} Sätze & Lücken fällig` : 'Nichts fällig – super!', '🔁', 'var(--blue)', due.length + items.length > 0,
      () => start('Tägliche Wiederholung', '#1a7fd6', F.dailyReview(due, items, S.options()))),
    tile('Schwache Wörter', 'Gezielt die Wörter, die dir schwerfallen', '🩹', 'var(--red)', weak.length > 0,
      () => start('Schwache Wörter', '#c62c39', F.vocabReview(weak, S.options()))),
    tile('Grammatik-Drill', grammar.length ? 'Lückentexte aus deinen Grammatik-Lektionen' : 'Nach der ersten Grammatik-Lektion verfügbar', '🧩', LEVEL_INFO.B2.color, grammar.length > 0,
      () => start('Grammatik-Drill', LEVEL_INFO.B2.color, F.grammarDrill(grammar))),
    tile('Hörtraining', S.p.listening ? 'Diktate & Hörverstehen' : 'In den Einstellungen deaktiviert', '👂', LEVEL_INFO.A2.color, studied.length > 0 && S.p.listening,
      () => start('Hörtraining', LEVEL_INFO.A2.color, F.listeningTraining(studied))),
    tile('Sprechtraining', !S.p.speaking ? 'In den Einstellungen deaktiviert' : 'Deutsch sehen – frei auf Italienisch sagen' + (recognitionSupported ? '' : ' (Selbstbewertung)'), '🎙️', 'var(--orange-t)', studied.length > 0 && S.p.speaking,
      () => start('Sprechtraining', '#b25e00', F.speakingTraining(studied))),
    tile('Audio-Training (freihändig)', 'Hören, selbst sagen, vergleichen – für unterwegs', '🎧', LEVEL_INFO.C1.color, studied.length > 0,
      () => openAudioMode(F.audioItems(studied), { onClose: rerender })),
    h('button', { class: 'tile', onclick: showVocabulary },
      h('div', { class: 'icon', 'aria-hidden': 'true', style: { background: 'color-mix(in srgb, var(--green) 18%, transparent)' } }, '📖'),
      h('div', { style: { flex: 1 } }, h('div', { class: 'bold' }, 'Mein Wortschatz'), h('div', { class: 'small muted' }, `${S.learnedWords().length} Wörter gelernt`)),
      h('div', { class: 'muted', 'aria-hidden': 'true' }, '›')),
    decksSection(rerender),
  );
}

function decksSection(rerender) {
  if (!Course.decks.length) return null;
  const total = Course.decks.reduce((n, d) => n + d.words.length, 0);
  return h('section', { class: 'col' },
    h('h2', { style: { fontSize: '22px', marginTop: '10px' } }, 'Wortschatz-Pakete'),
    h('div', { class: 'small muted' }, `${total} zusätzliche Wörter nach Themen. Jede Runde bringt 6 neue Wörter – danach kommen sie automatisch in die Wiederholung.`),
    LEVELS.map(level => {
      const decks = decksFor(level);
      if (!decks.length) return null;
      const info = LEVEL_INFO[level];
      return h('div', { class: 'col', style: { gap: '8px' } },
        h('div', { class: 'section-title' }, `${level} · ${info.name}`),
        h('div', { class: 'list' }, decks.map(deck => {
          const { learned, total: n } = S.deckProgress(deck);
          const doneAll = learned >= n;
          return h('button', { class: 'list-item', onclick: () => {
            const learnedIds = new Set(Object.keys(S.p.srs));
            startPractice(`${deck.title}`, info.color, F.deckLesson(deck, learnedIds, S.options()), rerender);
          } },
            h('span', { style: { fontSize: '24px' }, 'aria-hidden': 'true' }, deck.emoji),
            h('div', { style: { flex: 1 } }, h('div', {}, deck.title),
              h('div', { class: 'progress thin', style: { marginTop: '6px' } }, h('div', { style: { width: `${(learned / n) * 100}%`, background: info.color, minWidth: learned ? '10px' : '0' } }))),
            h('span', { class: 'small muted' }, doneAll ? '✓ wiederholen' : `${learned}/${n}`));
        })));
    }),
  );
}

function showVocabulary() {
  const list = h('div', { class: 'list' });
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Wort suchen', 'aria-label': 'Wort suchen', autocapitalize: 'off', autocorrect: 'off' });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    const entries = S.learnedWords().filter(e => !q || e.word.it.toLowerCase().includes(q) || e.word.de.toLowerCase().includes(q));
    list.replaceChildren(...(entries.length ? entries.slice(0, 300).map(({ word, card }) => {
      const st = S.strength(card);
      return h('div', { class: 'list-item' },
        sb(word.it),
        h('div', { style: { flex: 1 } }, h('div', { class: 'bold', lang: 'it' }, word.it), h('div', { class: 'small muted' }, word.de)),
        h('div', { class: 'strength', role: 'img', 'aria-label': `Stärke ${Math.round(st * 100)} %` },
          [0, 1, 2, 3].map(i => h('i', { class: st >= (i + 1) / 4.5 ? 'on' : '', style: { height: `${8 + i * 4}px` } }))));
    }) : [h('div', { class: 'list-item muted' }, 'Noch keine Wörter gelernt.')]));
  };
  search.addEventListener('input', render);
  render();
  openSheet(h('div', { class: 'col' }, h('h2', {}, 'Mein Wortschatz'), search, list));
}

// ════════════ GRAMMATIK ════════════

export function grammarView() {
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Thema suchen', 'aria-label': 'Grammatikthema suchen', autocapitalize: 'off' });
  const container = h('div', { class: 'col', style: { gap: '18px' } });
  const render = () => {
    const q = search.value.trim().toLowerCase();
    container.replaceChildren(...LEVELS.map(level => {
      const topics = unitsFor(level).map(u => u.grammar).filter(t => !q || t.title.toLowerCase().includes(q));
      if (!topics.length) return null;
      const info = LEVEL_INFO[level];
      return h('div', { class: 'col', style: { gap: '8px' } },
        h('div', { class: 'section-title' }, `${level} · ${info.name}`),
        h('div', { class: 'list' }, topics.map(topic => h('button', { class: 'list-item', onclick: () => showGrammar(topic) },
          h('span', { class: 'badge', style: { background: info.color } }, level),
          h('span', { style: { flex: 1 } }, topic.title),
          h('span', { class: 'muted', 'aria-hidden': 'true' }, '›')))));
    }).filter(Boolean));
  };
  search.addEventListener('input', render);
  render();
  return h('div', { class: 'screen' }, h('h1', { class: 'screen-title' }, 'Grammatik'), search, container);
}

// ════════════ PROFIL ════════════

export const GOALS = [[10, 'Locker', '1 Lektion'], [20, 'Normal', '2 Lektionen'], [30, 'Ernsthaft', '3 Lektionen'], [50, 'Intensiv', '4–5 Lektionen']];

export function restoreButton(onDone, cls = 'setting') {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, 'aria-hidden': 'true' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (typeof data !== 'object' || !data || !('xp' in data || 'completed' in data || 'srs' in data)) throw new Error('kein Parla-Backup');
      if (confirm('Fortschritt aus dieser Datei wiederherstellen? Der aktuelle Stand wird überschrieben.')) {
        S.replaceProgress({ ...data, hasOnboarded: true });
        onDone();
      }
    } catch { alert('Die Datei ist kein gültiges Parla-Backup.'); }
    fileInput.value = '';
  });
  return [h('button', { class: cls, style: { width: '100%' }, onclick: () => fileInput.click() }, '📂 Fortschritt wiederherstellen'), fileInput];
}

export function profileView(rerender) {
  const p = S.p;
  const accuracy = p.totalAnswers ? `${Math.round((p.totalCorrect / p.totalAnswers) * 100)} %` : '–';
  const box = (value, label, icon) => h('div', { class: 'stat-box' }, h('div', { style: { fontSize: '24px' }, 'aria-hidden': 'true' }, icon),
    h('div', {}, h('div', { class: 'v' }, value), h('div', { class: 'small muted' }, label)));

  const week = S.lastWeek();
  const max = Math.max(p.dailyGoal, ...week.map(d => d.xp), 1);
  const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

  const select = (label, value, options, onChange) => h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text)));
  const toggle = (label, checked, onChange) => h('label', { class: 'switch' },
    h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked, onchange: (e) => onChange(e.target.checked) }), h('span', { 'aria-hidden': 'true' }));
  const setting = (label, control) => h('div', { class: 'setting' }, h('div', {}, label), control);
  const update = (fn) => { fn(); S.save(); rerender(); };

  const rate = h('input', { type: 'range', min: '0.6', max: '1.2', step: '0.05', value: String(p.speechRate), 'aria-label': 'Sprechtempo' });
  rate.addEventListener('change', () => { p.speechRate = Number(rate.value); S.save(); speak('Ciao! Come stai?'); });

  return h('div', { class: 'screen' },
    h('h1', { class: 'screen-title' }, 'Profil'),
    h('div', { class: 'row' }, box(S.currentStreak(), 'Tage Serie', '🔥'), box(p.xp, 'XP gesamt', '⚡️')),
    h('div', { class: 'row' }, box(S.learnedWords().length, 'Wörter', '📖'), box(accuracy, 'Trefferquote', '🎯')),
    h('div', { class: 'card col', role: 'img', 'aria-label': 'XP der letzten 7 Tage: ' + week.map(d => d.xp).join(', ') },
      h('div', { class: 'bold small' }, 'Letzte 7 Tage'),
      h('div', { class: 'week', 'aria-hidden': 'true' }, week.map(d => h('div', {},
        h('div', { class: 'bar', style: { height: `${Math.max(6, (d.xp / max) * 80)}px`, background: d.xp >= p.dailyGoal ? 'var(--green)' : d.xp > 0 ? 'color-mix(in srgb, var(--green) 45%, transparent)' : 'var(--stroke)' } }),
        dayFmt.format(d.date))))),

    h('h2', { class: 'section-title' }, 'Niveau'),
    h('div', { class: 'list' },
      setting('Aktuelles Niveau', h('span', { class: 'muted' }, `${S.currentLevel()} · ${LEVEL_INFO[S.currentLevel()].name}`)),
      setting('Längste Serie', h('span', { class: 'muted' }, `${p.longestStreak} Tage`)),
      setting('Startniveau', select('Startniveau', p.startLevel, LEVELS.map(l => [l, `${l} · ${LEVEL_INFO[l].name}`]), v => update(() => { p.startLevel = v; }))),
      setting('Tagesziel', select('Tagesziel', p.dailyGoal, GOALS.map(([v, name, n]) => [v, `${name} · ${n}`]), v => update(() => { p.dailyGoal = Number(v); })))),

    h('h2', { class: 'section-title' }, 'Übungen'),
    h('div', { class: 'list' },
      setting('Hörübungen', toggle('Hörübungen', p.listening, v => update(() => { p.listening = v; }))),
      setting('Sprechübungen', toggle('Sprechübungen', p.speaking, v => update(() => { p.speaking = v; }))),
      setting('Soundeffekte', toggle('Soundeffekte', p.sounds, v => update(() => { p.sounds = v; }))),
      h('div', { class: 'setting', style: { flexDirection: 'column', alignItems: 'stretch' } },
        h('div', {}, 'Sprechtempo der Stimme'),
        h('div', { class: 'row' }, h('span', { 'aria-hidden': 'true' }, '🐢'), rate, h('span', { 'aria-hidden': 'true' }, '🐇')),
        h('div', { class: 'small muted' }, `Stimme: ${voiceName()}`)),
      setting('Stimme', select('Stimme', p.voiceURI, [['', 'Automatisch (empfohlen)'], ...italianVoiceList().map(v => [v.voiceURI, `${v.name} (${v.lang})`])],
        v => { setVoice(v); speak('Ciao! Come stai?'); rerender(); })),
      h('button', { class: 'setting', style: { width: '100%', color: 'var(--green-t)', fontWeight: 600 }, onclick: () => speak('Ciao! Benvenuto. Impariamo l\'italiano insieme.') }, 'Stimme testen'),
      h('button', { class: 'setting', style: { width: '100%' }, onclick: () => { resetVoiceMemory(); speak('Buongiorno!'); rerender(); } }, 'Stimmen neu prüfen')),
    h('div', { class: 'small muted', style: { margin: '-8px 4px 0' } },
      italianVoiceList().length ? `${italianVoiceList().length} italienische Stimme(n) gefunden. Klingt die Aussprache falsch oder bleibt stumm: andere Stimme wählen und „Stimme testen“. Kein Ton? Stummschalter prüfen.` : '⚠️ Keine italienische Stimme auf diesem iPhone – deshalb klingt die Aussprache falsch. Lade eine unter Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen › Italienisch (z. B. „Alice“) und öffne die App neu.'),

    h('h2', { class: 'section-title' }, 'Daten'),
    h('div', { class: 'list' },
      h('button', { class: 'setting', style: { width: '100%' }, onclick: async () => { await backup(); rerender(); } }, '💾 Fortschritt sichern'),
      ...restoreButton(rerender),
      h('button', { class: 'setting', style: { width: '100%', color: 'var(--red)' }, onclick: () => {
        if (confirm('Wirklich alles zurücksetzen? XP, Serie, Wörter und Lektionen werden gelöscht.')) { S.reset(); location.reload(); }
      } }, 'Gesamten Fortschritt zurücksetzen')),
    h('div', { class: 'small muted center' }, p.lastBackup ? `Letztes Backup: ${new Date(p.lastBackup).toLocaleDateString('de-DE')}` : 'Noch kein Backup erstellt.'),
    h('div', { class: 'small muted center' }, 'Parla · Dein Fortschritt wird nur auf diesem Gerät gespeichert.'),
  );
}

export async function backup() {
  const json = S.exportProgress();
  const name = `parla-backup-${S.dayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Parla-Backup' }); } catch { /* abgebrochen */ }
    return;
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a);
  a.click();
  a.remove();
}
