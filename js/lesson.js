// Ablauf einer Lektion: Fortschritt, Übung, Feedback, Wiederholung bis zur richtigen Lösung,
// Bestehensgrenze und Abschluss.
import { h, svg, ICONS, speakButton, haptic, sample } from './ui.js';
import { renderExercise } from './exercises.js';
import { isSpeaking, isListening, isInfo } from './factory.js';
import { speak, stopSpeaking } from './speech.js';
import { addXP, completeLesson, recordAnswer, recordWord, recordItem } from './state.js';
import { playCorrect, playWrong, playComplete } from './sound.js';

const PRAISE = ['Super!', 'Perfetto!', 'Bravissimo!', 'Genau!', 'Fantastico!', 'Richtig!', 'Ottimo!'];
const MAX_ATTEMPTS = 3;

/**
 * @param {{title, lessonId?, color?, exercises, threshold?, onClose?, onRetry?}} opts
 *   threshold: Mindest-Trefferquote beim ersten Versuch (nur für Lektionen des Lernpfads)
 *   onRetry: liefert neue Übungen für „Nochmal versuchen“
 */
export function openLesson({ title, lessonId = null, color = 'var(--green)', exercises, threshold = 0, onClose, onRetry }) {
  const total = exercises.filter(e => !isInfo(e)).length || 1;
  const s = {
    queue: exercises, index: 0, solved: 0, firstTry: 0, graded: 0, combo: 0, best: 0,
    skipSpeak: false, skipListen: false, start: Date.now(), done: false,
  };
  const root = h('div', { class: 'lesson', style: { '--accent': color } });
  document.body.append(root);
  document.body.classList.add('no-scroll');

  // Zurück-Wischen in Safari: erst nachfragen
  history.pushState({ lesson: true }, '');
  const onPop = () => {
    if (s.done || confirm('Lektion abbrechen? Dein Fortschritt in dieser Lektion geht verloren.')) close(true);
    else history.pushState({ lesson: true }, '');
  };
  window.addEventListener('popstate', onPop);

  // Bildschirmtastatur: Lektion auf den sichtbaren Bereich verkleinern, damit „Überprüfen“ sichtbar bleibt
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv) return;
    root.style.height = `${vv.height}px`;
    root.style.transform = `translateY(${vv.offsetTop}px)`;
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);
  fit();

  function close(fromHistory = false) {
    stopSpeaking();
    window.removeEventListener('popstate', onPop);
    vv?.removeEventListener('resize', fit);
    vv?.removeEventListener('scroll', fit);
    if (!fromHistory) history.back();
    root.remove();
    if (!document.querySelector('.sheet, .lesson')) document.body.classList.remove('no-scroll');
    onClose?.();
  }

  const accuracy = () => (s.graded ? s.firstTry / s.graded : 1);
  const passed = () => accuracy() + 1e-9 >= threshold;
  const earnedXP = () => {
    if (!lessonId) return Math.max(3, s.firstTry);
    if (!passed()) return 3;
    return 10 + (accuracy() >= 0.999 ? 5 : 0) + (s.best >= 8 ? 3 : 0);
  };

  const shouldSkip = (e) => (s.skipSpeak && isSpeaking(e)) || (s.skipListen && isListening(e));
  function advance() {
    do { s.index++; } while (s.index < s.queue.length && shouldSkip(s.queue[s.index]));
    show();
  }

  function show() {
    root.replaceChildren();
    if (s.index >= s.queue.length) return showComplete();
    const exercise = s.queue[s.index];

    const bar = h('div', { style: { width: `${(s.solved / total) * 100}%`, background: color } });
    const header = h('div', { class: 'lesson-header' },
      h('button', { class: 'icon-btn', 'aria-label': 'Lektion beenden', onclick: () => {
        if (confirm('Lektion abbrechen? Dein Fortschritt in dieser Lektion geht verloren.')) close();
      } }, svg(ICONS.close)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(Math.round((s.solved / total) * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar),
      s.combo >= 3 ? h('div', { class: 'combo' }, `🔥 ${s.combo}`) : null,
      exercise.attempt > 0 ? h('div', { class: 'retry-tag' }, '↻') : null,
    );

    const body = h('div', { class: 'lesson-body' });
    body.append(renderExercise(exercise, {
      onResult: (result) => handleResult(exercise, result),
      onContinue: advance,
      onSkip: () => {
        if (isSpeaking(exercise)) s.skipSpeak = true;
        if (isListening(exercise)) s.skipListen = true;
        s.solved++;
        advance();
      },
    }));
    root.append(header, body);
  }

  function handleResult(exercise, result) {
    if (result.correct) { playCorrect(); haptic(15); } else { playWrong(); haptic([30, 40, 30]); }
    if (!result.ungraded) {
      recordAnswer(result.correct);
      if (exercise.vocabId) recordWord(exercise.vocabId, result.correct);
      if (exercise.itemKey) recordItem(exercise.itemKey, result.correct);
    }
    if (exercise.attempt === 0) {
      s.graded++;
      if (result.correct) s.firstTry++;
    }
    if (result.correct) {
      s.combo++;
      s.best = Math.max(s.best, s.combo);
      s.solved++;
    } else {
      s.combo = 0;
      // Falsche Aufgaben kommen wieder – bis sie sitzen (max. 3 Versuche)
      if (exercise.attempt + 1 < MAX_ATTEMPTS) s.queue.push({ ...exercise, attempt: exercise.attempt + 1, id: exercise.id + 'r' });
      else s.solved++;
    }
    showFeedback(result, exercise);
  }

  function diffView(diff) {
    if (!diff) return null;
    return h('div', { class: 'diff', lang: 'it' },
      h('div', {}, h('span', { class: 'small bold' }, 'Deine Antwort: '),
        diff.given.map(t => h('span', { class: t.ok ? '' : 'diff-bad' }, t.w + ' '))),
    );
  }

  function showFeedback(result, exercise) {
    const fc = result.correct ? 'var(--green)' : 'var(--red)';
    const speakText = result.speak || result.solution;
    const willRetry = !result.correct && exercise.attempt + 1 < MAX_ATTEMPTS;
    const solutionEl = result.solution && (!result.correct || result.diff)
      ? h('div', {},
          h('div', { class: 'bold small' }, result.correct ? 'Lösung:' : 'Richtige Lösung:'),
          result.diff
            ? h('div', { lang: 'it' }, result.diff.expected.map(t => h('span', { class: t.ok ? '' : 'diff-good' }, t.w + ' ')))
            : h('div', { lang: 'it' }, result.solution))
      : null;
    const panel = h('div', { class: 'feedback', role: 'status', style: { '--fc': fc } },
      h('div', { class: 'feedback-inner' },
        h('div', { class: 'row' },
          h('div', { class: 'feedback-title' }, result.correct ? `✓ ${sample(PRAISE)}` : '✗ Nicht ganz …'),
          h('div', { class: 'spacer' }),
          speakText ? speakButton(speakText, { size: 'small', onSpeak: speak }) : null),
        result.correct ? null : diffView(result.diff),
        solutionEl,
        result.why && (!result.correct || exercise.attempt > 0) ? h('div', { class: 'why' }, '💡 ', result.why) : null,
        result.note ? h('div', { class: 'small' }, result.note) : null,
        willRetry ? h('div', { class: 'small' }, 'Diese Aufgabe kommt gleich nochmal.') : null,
        h('button', { class: `btn ${result.correct ? '' : 'red'}`, onclick: advance }, result.correct ? 'Weiter' : 'Verstanden'),
      ),
    );
    root.append(panel);
    const body = root.querySelector('.lesson-body');
    if (body) body.style.paddingBottom = `${panel.offsetHeight + 16}px`;
    panel.querySelector('.btn')?.focus({ preventScroll: true });
  }

  function showComplete() {
    const ok = passed();
    if (!s.done) {
      s.done = true;
      addXP(earnedXP());
      if (lessonId && ok) completeLesson(lessonId, accuracy());
      if (ok) playComplete(); else playWrong();
    }
    const secs = Math.round((Date.now() - s.start) / 1000);
    const perfect = accuracy() >= 0.999;
    const stat = (label, value, c) => h('div', { class: 'stat', style: { background: c, '--sc': c } }, label, h('div', {}, value));
    const pct = Math.round(accuracy() * 100);
    root.append(h('div', { class: 'complete' },
      h('div', { class: 'trophy', 'aria-hidden': 'true' }, !ok ? '💪' : perfect ? '👑' : '⭐️'),
      h('div', { class: 'center col', style: { gap: '6px' } },
        h('h1', {}, !ok ? 'Fast geschafft!' : perfect ? 'Perfetto!' : 'Lektion geschafft!'),
        h('div', { class: 'muted bold' }, title),
        !ok ? h('div', { class: 'small' }, `Du brauchst ${Math.round(threshold * 100)} % beim ersten Versuch – du hattest ${pct} %. Noch eine Runde, dann sitzt es!`) : null),
      h('div', { class: 'stats' },
        stat('XP', `⚡️ +${earnedXP()}`, 'var(--gold)'),
        stat('Genauigkeit', `🎯 ${pct} %`, ok ? 'var(--green)' : 'var(--red)'),
        stat('Zeit', `⏱ ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 'var(--blue)')),
      ok && s.best >= 5 ? h('div', { class: 'bold', style: { color: 'var(--orange-t)' } }, `🔥 Beste Serie: ${s.best} richtig in Folge`) : null,
      !ok && onRetry ? h('button', { class: 'btn', style: { marginTop: '20px' }, onclick: () => { close(); setTimeout(onRetry, 50); } }, 'Nochmal versuchen') : null,
      h('button', { class: ok ? 'btn' : 'btn-link', style: { marginTop: ok ? '20px' : '0' }, onclick: () => close() }, ok ? 'Weiter' : 'Später'),
    ));
  }

  if (!exercises.length) { close(); return; }
  show();
}
