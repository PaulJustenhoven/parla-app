// Begrüßung, Niveauwahl, Einstufungstest und Tagesziel.
import { h, svg, ICONS, shuffle, haptic } from './ui.js';
import { LEVELS, LEVEL_INFO } from './course.js';
import { placementQuestions } from './factory.js';
import * as S from './state.js';
import { restoreButton, GOALS } from './views.js';

export function onboardingView(done) {
  let level = 'A1';
  let goal = 20;
  let placement = null;
  const root = h('div', { class: 'screen', style: { minHeight: '100vh', paddingBottom: 'calc(var(--safe-bottom) + 24px)' } });

  function welcome() {
    root.replaceChildren(
      h('div', { class: 'spacer' }),
      h('div', { class: 'center', style: { fontSize: '96px' } }, '🇮🇹'),
      h('h1', { class: 'center', style: { fontSize: '32px' } }, 'Benvenuto bei Parla!'),
      h('p', { class: 'center muted', style: { fontSize: '19px' } }, 'Vom ersten „Ciao“ bis zum fließenden Gespräch – mit Vokabeln, Grammatik, Hör- und Sprechübungen. Ein paar Minuten am Tag reichen.'),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: levelPicker }, 'Los geht\'s'),
      ...restoreButton(done, 'btn-link'),
    );
  }

  function levelPicker() {
    const options = LEVELS.map(l => {
      const info = LEVEL_INFO[l];
      return h('button', {
        class: `level-option ${l === level ? 'selected' : ''}`, style: { '--lc': info.color },
        onclick: () => { haptic(); level = l; levelPicker(); },
      },
      h('div', { class: 'level-chip', style: { background: info.color } }, l),
      h('div', {}, h('div', { class: 'bold' }, info.name), h('div', { class: 'small muted' }, info.summary)));
    });
    root.replaceChildren(
      h('h2', { style: { fontSize: '26px', paddingTop: '8px' } }, 'Wie gut sprichst du schon Italienisch?'),
      h('div', { class: 'col', style: { gap: '10px' } }, options),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn blue', onclick: placementTest }, '🪄 Ich weiß es nicht – Einstufungstest'),
      h('button', { class: 'btn', onclick: goalPicker }, `Weiter mit ${level}`),
    );
  }

  function placementTest() {
    const questions = placementQuestions();
    const correct = {};
    let index = 0;

    function finish(result) {
      level = result;
      placement = result;
      goalPicker();
    }

    function question() {
      if (index >= questions.length) return finish('C1');
      const { level: qLevel, cloze } = questions[index];
      let selected = null;
      const options = shuffle([cloze.answer, ...cloze.wrong]);
      const buttons = [...options, 'Weiß ich nicht'].map(o => h('button', {
        class: 'option', 'data-value': o,
        onclick: () => {
          haptic();
          selected = o;
          buttons.forEach(b => b.classList.toggle('selected', b.dataset.value === o));
          btn.disabled = false;
        },
      }, o));
      const btn = h('button', { class: 'btn', disabled: true, onclick: () => {
        if (selected === cloze.answer) correct[qLevel] = (correct[qLevel] || 0) + 1;
        const lastOfLevel = index + 1 >= questions.length || questions[index + 1].level !== qLevel;
        if (lastOfLevel) {
          const asked = questions.filter(q => q.level === qLevel).length;
          // Mindestens 2 von 3 richtig, um ein Niveau zu „bestehen“.
          if ((correct[qLevel] || 0) * 3 < asked * 2) return finish(qLevel);
        }
        index++;
        question();
      } }, 'Weiter');

      const bar = h('div', { style: { width: `${(index / questions.length) * 100}%`, background: 'var(--blue)' } });
      root.replaceChildren(
        h('div', { class: 'row', style: { gap: '14px' } },
          h('button', { class: 'icon-btn', onclick: levelPicker, 'aria-label': 'Abbrechen' }, svg(ICONS.close)),
          h('div', { class: 'progress' }, bar)),
        h('div', { class: 'small muted bold' }, `Einstufungstest · Frage ${index + 1} von ${questions.length}`),
        h('div', { class: 'instruction' }, 'Welches Wort passt?'),
        h('div', { class: 'cloze-box col', style: { gap: '8px' } },
          h('div', { class: 'cloze-text' }, cloze.text.replace('___', '_____')),
          h('div', { class: 'small muted' }, cloze.de)),
        h('div', { class: 'options' }, buttons),
        h('div', { class: 'spacer' }),
        btn,
      );
    }
    question();
  }

  function goalPicker() {
    const goals = GOALS;
    root.replaceChildren(
      placement ? h('div', { class: 'card bold', style: { color: LEVEL_INFO[placement].color } }, `✅ Einstufung: ${placement} · ${LEVEL_INFO[placement].name}`) : null,
      h('h2', { style: { fontSize: '26px', paddingTop: '8px' } }, 'Wähle dein Tagesziel'),
      h('div', { class: 'muted' }, 'Eine Lektion dauert etwa 5–10 Minuten und bringt 10–18 XP.'),
      h('div', { class: 'options' }, goals.map(([v, name, time]) => h('button', {
        class: `option ${goal === v ? 'selected' : ''}`, onclick: () => { haptic(); goal = v; goalPicker(); },
      }, `${name} · ${time} am Tag (${v} XP)`))),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => {
        S.p.startLevel = level;
        S.p.dailyGoal = goal;
        S.p.hasOnboarded = true;
        S.save();
        done();
      } }, 'Kurs starten'),
    );
  }

  welcome();
  return root;
}
