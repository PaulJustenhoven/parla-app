// Die einzelnen Übungstypen. Jede Funktion liefert ein DOM-Element.
// ctx: { onResult({correct, solution, note, why, diff, speak, ungraded}), onContinue(), onSkip() }
import { h, svg, ICONS, speakButton, shuffle, haptic, markdown } from './ui.js';
import { speak, autoSpeak, listen, recognitionSupported, playSequence, stopSpeaking } from './speech.js';
import { check, speechScore, normalize, diffWords } from './checker.js';
import { p, introduceWord } from './state.js';
import { LEVEL_INFO } from './course.js';

export function renderExercise(e, ctx) {
  switch (e.type) {
    case 'introduce': return introduce(e.data, ctx);
    case 'grammarCard': return grammarCard(e.data, ctx);
    case 'dialogue': return dialogue(e.data, ctx);
    case 'choice': return choice(e.data, ctx, false);
    case 'listenChoice': return choice(e.data, ctx, true);
    case 'match': return match(e.data, ctx);
    case 'wordBank': return wordBank(e.data, ctx);
    case 'typing': return typing(e.data, ctx);
    case 'cloze': return cloze(e.data, ctx);
    case 'speak': return speakExercise(e.data, ctx);
    default: return h('div', {}, 'Unbekannte Übung');
  }
}

const sb = (text, opts = {}) => speakButton(text, { ...opts, onSpeak: speak });
const checkButton = (label, onClick) => h('button', { class: 'btn', disabled: true, onclick: onClick }, label);
const skipButton = (label, ctx) => h('button', { class: 'btn-link', onclick: () => ctx.onSkip() }, label);
const screen = (...children) => h('div', { class: 'col', style: { flex: '1', gap: '22px' } }, ...children);

// ── Neues Wort ───────────────────────────────
function introduce(word, ctx) {
  introduceWord(word.it);
  autoSpeak(word.it);
  return h('div', { class: 'col', style: { flex: '1' } },
    h('div', { class: 'tag' }, '✨ Neues Wort'),
    h('div', { class: 'new-word' },
      sb(word.it, { size: 'mid' }),
      h('div', { class: 'it', lang: 'it' }, word.it),
      h('div', { class: 'de' }, word.de),
    ),
    h('div', { class: 'bottom' }, h('button', { class: 'btn', onclick: () => ctx.onContinue() }, 'Weiter')),
  );
}

// ── Grammatik-Karte ──────────────────────────
function grammarCard(topic, ctx) {
  return h('div', { class: 'col', style: { flex: '1' } },
    grammarContent(topic),
    h('div', { class: 'bottom' }, h('button', { class: 'btn', onclick: () => ctx.onContinue() }, 'Verstanden – los geht\'s!')),
  );
}

export function grammarContent(topic) {
  const info = LEVEL_INFO[topic.level];
  const table = topic.table?.length ? h('div', { class: 'table-wrap' }, h('table', {},
    topic.table.map((row, i) => h('tr', {}, row.map(cell => i === 0
      ? h('th', { style: { color: info.color } }, cell)
      : h('td', {}, cell)))),
  )) : null;
  return h('div', { class: 'grammar' },
    h('div', { class: 'row' }, h('span', { class: 'badge', style: { background: info.color } }, topic.level), h('span', { class: 'muted bold small' }, 'Grammatik')),
    h('h2', {}, topic.title),
    h('div', { html: markdown(topic.explanation) }),
    table,
    topic.examples?.length ? h('div', { class: 'col' },
      h('h3', {}, 'Beispiele'),
      topic.examples.map(ex => h('div', { class: 'example' },
        sb(ex.it, { size: 'small' }),
        h('div', {}, h('div', { class: 'bold', lang: 'it' }, ex.it), h('div', { class: 'muted small' }, ex.de)),
      )),
    ) : null,
    topic.tip ? h('div', { class: 'tip', html: '💡 ' + markdown(topic.tip).replace(/^<p>|<\/p>$/g, '') }) : null,
  );
}

// ── Dialog ───────────────────────────────────
function dialogue(d, ctx) {
  let player = null;
  let showAll = false;
  const bubbles = d.lines.map((line) => {
    const de = h('div', { class: 'small muted', style: { display: 'none', marginTop: '4px' } }, line.de);
    const bubble = h('button', {
      class: `chat ${line.speaker === 'B' ? 'right' : ''}`,
      onclick: () => {
        speak(line.it, false, { speaker: line.speaker === 'B' ? 1 : 0 });
        de.style.display = de.style.display === 'none' ? '' : 'none';
      },
    }, h('div', { class: 'chat-name' }, line.name), h('div', { lang: 'it' }, line.it), de);
    bubble._de = de;
    return bubble;
  });

  const playBtn = h('button', { class: 'btn blue', onclick: togglePlay }, '▶ Gespräch anhören');
  const highlight = (index) => bubbles.forEach((b, i) => b.classList.toggle('active', i === index));
  function togglePlay() {
    if (player) { player.stop(); player = null; playBtn.textContent = '▶ Gespräch anhören'; highlight(-1); return; }
    playBtn.textContent = '⏸ Stopp';
    player = playSequence(d.lines.map(l => ({ text: l.it, speaker: l.speaker === 'B' ? 1 : 0, pause: 500 })), {
      onStep: (i) => { highlight(i); bubbles[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
      onDone: () => { player = null; playBtn.textContent = '▶ Nochmal anhören'; highlight(-1); },
    });
  }
  const toggleAll = h('button', { class: 'btn-link', onclick: () => {
    showAll = !showAll;
    bubbles.forEach(b => { b._de.style.display = showAll ? '' : 'none'; });
    toggleAll.textContent = showAll ? 'Übersetzung ausblenden' : 'Übersetzung einblenden';
  } }, 'Übersetzung einblenden');

  return screen(
    h('div', {}, h('div', { class: 'tag' }, '🎭 Dialog'), h('div', { class: 'instruction', lang: 'it' }, d.title)),
    h('div', { class: 'small muted' }, 'Hör dir das Gespräch an. Tippe auf eine Sprechblase für Audio und Übersetzung.'),
    h('div', { class: 'chat-list' }, bubbles),
    h('div', { class: 'bottom' }, playBtn, toggleAll,
      h('button', { class: 'btn', onclick: () => { player?.stop(); stopSpeaking(); ctx.onContinue(); } }, 'Zu den Fragen')),
  );
}

// ── Multiple Choice / Hören ──────────────────
function choice(d, ctx, listenOnly) {
  let selected = null;
  let locked = false;
  const buttons = d.options.map(option => h('button', {
    class: 'option', 'data-value': option, lang: d.italianOptions || listenOnly ? 'it' : null,
    onclick: () => {
      if (locked) return;
      haptic();
      selected = option;
      buttons.forEach(b => b.classList.toggle('selected', b.dataset.value === option));
      if (d.italianOptions && !listenOnly && p.listening) speak(option);
      btn.disabled = false;
    },
  }, option));

  const btn = checkButton('Überprüfen', () => {
    locked = true;
    buttons.forEach(b => {
      b.classList.remove('selected');
      if (b.dataset.value === d.answer) b.classList.add('correct');
      else if (b.dataset.value === selected) b.classList.add('wrong');
      else b.classList.add('disabled');
    });
    bottom.remove();
    ctx.onResult({ correct: selected === d.answer, solution: d.answer, speak: d.italianOptions || listenOnly ? d.answer : d.speech });
  });

  if (d.speech) autoSpeak(d.speech);

  const promptEl = listenOnly
    ? h('div', { class: 'row', style: { justifyContent: 'center', gap: '18px', padding: '10px 0' } },
        sb(d.speech, { size: 'big' }), sb(d.speech, { size: 'mid', slow: true }))
    : h('div', { class: 'row', style: { gap: '14px' } }, d.speech ? sb(d.speech) : null, h('div', { class: 'prompt', lang: d.speech ? 'it' : null }, d.prompt));

  const bottom = h('div', { class: 'bottom' }, listenOnly ? skipButton('Kann gerade nicht zuhören', ctx) : null, btn);
  return screen(h('div', { class: 'instruction' }, d.instruction), promptEl, h('div', { class: 'options' }, buttons), bottom);
}

// ── Lückentext ───────────────────────────────
function cloze(c, ctx) {
  let selected = null;
  let locked = false;
  const [before, after] = c.text.split('___');
  const blank = h('span', { class: 'blank' }, '_____');
  const afterNode = document.createTextNode(after);
  const options = shuffle([c.answer, ...c.wrong]);
  // Elidierte Formen (un', quell') schließen direkt ans nächste Wort an.
  const tail = (option) => (option.endsWith("'") ? after.replace(/^ /, '') : after);
  const filled = before + c.answer + tail(c.answer);

  const buttons = options.map(option => h('button', {
    class: 'option center', 'data-value': option, lang: 'it',
    onclick: () => {
      if (locked) return;
      haptic();
      selected = option;
      blank.textContent = option;
      afterNode.textContent = tail(option);
      buttons.forEach(b => b.classList.toggle('selected', b.dataset.value === option));
      btn.disabled = false;
    },
  }, option));

  const btn = checkButton('Überprüfen', () => {
    locked = true;
    const correct = selected === c.answer;
    blank.classList.add(correct ? 'correct' : 'wrong');
    buttons.forEach(b => {
      b.classList.remove('selected');
      if (b.dataset.value === c.answer) b.classList.add('correct');
      else if (b.dataset.value === selected) b.classList.add('wrong');
      else b.classList.add('disabled');
    });
    bottom.remove();
    autoSpeak(filled);
    ctx.onResult({ correct, solution: filled, why: c.why || null });
  });

  const bottom = h('div', { class: 'bottom' }, btn);
  return screen(
    h('div', { class: 'instruction' }, 'Fülle die Lücke'),
    h('div', { class: 'cloze-box col', style: { gap: '8px' } },
      h('div', { class: 'cloze-text', lang: 'it' }, before, blank, afterNode),
      h('div', { class: 'muted small' }, c.de),
    ),
    h('div', { class: 'chips' }, buttons),
    bottom,
  );
}

// ── Paare finden ─────────────────────────────
function match(words, ctx) {
  let left = null, right = null, mistakes = 0, matched = 0;
  const make = (word, side) => h('button', {
    class: 'option', 'data-id': word.it, 'data-side': side, lang: side === 'L' ? 'it' : null,
    onclick: (ev) => {
      const el = ev.currentTarget;
      if (el.classList.contains('done')) return;
      haptic();
      grid.querySelectorAll(`[data-side="${side}"]`).forEach(b => b.classList.remove('selected'));
      el.classList.add('selected');
      if (side === 'L') { left = el; if (p.listening) speak(word.it); } else right = el;
      evaluate();
    },
  }, side === 'L' ? word.it : word.de);

  const L = shuffle(words).map(w => make(w, 'L'));
  const R = shuffle(words).map(w => make(w, 'R'));
  const grid = h('div', { class: 'match' });
  for (let i = 0; i < words.length; i++) grid.append(L[i], R[i]);

  function evaluate() {
    if (!left || !right) return;
    const [l, r] = [left, right];
    left = right = null;
    l.classList.remove('selected');
    r.classList.remove('selected');
    if (l.dataset.id === r.dataset.id) {
      l.classList.add('done');
      r.classList.add('done');
      matched++;
      // Paare finden zählt bewusst nicht für die Wiederholungsplanung (zu leicht).
      if (matched === words.length) ctx.onResult({ correct: true, note: mistakes === 0 ? 'Alle Paare fehlerfrei!' : null, ungraded: true });
    } else {
      mistakes++;
      haptic([30, 40, 30]);
      l.classList.add('wrong');
      r.classList.add('wrong');
      setTimeout(() => { l.classList.remove('wrong'); r.classList.remove('wrong'); }, 500);
    }
  }

  return screen(h('div', { class: 'instruction' }, 'Finde die Paare'), grid);
}

// ── Wortbank ─────────────────────────────────
function wordBank(d, ctx) {
  const chosen = [];
  let locked = false;
  const answerArea = h('div', { class: 'answer-area', lang: 'it' });
  const bank = h('div', { class: 'chips', style: { justifyContent: 'center' }, lang: 'it' });

  const bankChips = d.bank.map((token, index) => h('button', {
    class: 'word-chip',
    onclick: () => {
      if (locked || chosen.includes(index)) return;
      haptic();
      if (p.listening) speak(token);
      chosen.push(index);
      update();
    },
  }, token));
  bank.append(...bankChips);

  function update() {
    answerArea.replaceChildren(...chosen.map(index => h('button', {
      class: 'word-chip',
      onclick: () => {
        if (locked) return;
        haptic();
        chosen.splice(chosen.indexOf(index), 1);
        update();
      },
    }, d.bank[index])));
    bankChips.forEach((chip, i) => chip.classList.toggle('used', chosen.includes(i)));
    btn.disabled = chosen.length === 0;
  }

  const btn = checkButton('Überprüfen', () => {
    locked = true;
    const sentence = chosen.map(i => d.bank[i]).join(' ');
    const correct = d.answers.some(a => normalize(a) === normalize(sentence));
    bottom.remove();
    autoSpeak(d.italian);
    ctx.onResult({ correct, solution: d.italian, diff: correct ? null : diffWords(sentence, d.italian) });
  });

  const bottom = h('div', { class: 'bottom' }, btn);
  return screen(
    h('div', { class: 'instruction' }, 'Übersetze diesen Satz'),
    h('div', { class: 'row', style: { alignItems: 'flex-start' } },
      h('div', { style: { fontSize: '34px' }, 'aria-hidden': 'true' }, '🧑‍🏫'),
      h('div', { class: 'bubble' }, d.prompt)),
    answerArea,
    bank,
    bottom,
  );
}

// ── Eintippen / Diktat ───────────────────────
function typing(d, ctx) {
  const input = h('textarea', {
    class: 'text-input', rows: 2, placeholder: 'Auf Italienisch …', lang: 'it', 'aria-label': 'Antwort auf Italienisch',
    autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'done',
  });
  input.addEventListener('input', () => { btn.disabled = !input.value.trim(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!btn.disabled) btn.click(); }
  });

  const accents = h('div', { class: 'accents', lang: 'it' }, ['à', 'è', 'é', 'ì', 'ò', 'ù'].map(a => h('button', {
    'aria-label': `${a} einfügen`,
    onpointerdown: (e) => e.preventDefault(), // Tastatur offen lassen
    onclick: () => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = input.value.slice(0, start) + a + input.value.slice(end);
      input.setSelectionRange(start + 1, start + 1);
      input.dispatchEvent(new Event('input'));
    },
  }, a)));

  const btn = checkButton('Überprüfen', () => {
    input.blur();
    input.readOnly = true;
    bottom.remove();
    accents.remove();
    const res = check(input.value, d.answers);
    const notes = {
      correct: d.dictation ? `„${d.prompt}“` : null,
      accent: `Achte auf die Akzente: ${res.answer}`,
      typo: `Kleiner Tippfehler – richtig ist: ${res.answer}`,
    };
    ctx.onResult({
      correct: res.verdict !== 'wrong', solution: res.answer, note: notes[res.verdict] || null, speak: res.answer,
      diff: res.verdict === 'correct' ? null : diffWords(input.value, res.answer),
    });
  });

  if (d.dictation && d.speech) autoSpeak(d.speech);

  const bottom = h('div', { class: 'bottom' }, d.dictation ? skipButton('Kann gerade nicht zuhören', ctx) : null, btn);
  return screen(
    h('div', { class: 'instruction' }, d.instruction),
    d.dictation
      ? h('div', { class: 'row', style: { justifyContent: 'center', gap: '18px', padding: '6px 0' } },
          sb(d.speech, { size: 'big' }), sb(d.speech, { size: 'mid', slow: true }))
      : h('div', { class: 'prompt' }, d.prompt),
    input,
    accents,
    bottom,
  );
}

// ── Sprechen (nachsprechen oder aus dem Gedächtnis) ──
function speakExercise(sentence, ctx) {
  const memory = !!sentence.memory;
  let attempts = 0, session = null, locked = false, revealed = !memory;

  const italian = h('div', { class: 'prompt', lang: 'it', style: { display: revealed ? '' : 'none' } }, sentence.it);
  const german = h('div', { class: memory ? 'prompt' : 'muted small' }, sentence.de);
  const speakBtn = sb(sentence.it);
  speakBtn.style.display = revealed ? '' : 'none';
  const revealBtn = memory ? h('button', { class: 'btn-link', style: { textAlign: 'left', padding: '4px 0' }, onclick: reveal }, '👀 Lösung zeigen') : null;

  function reveal() {
    revealed = true;
    italian.style.display = '';
    speakBtn.style.display = '';
    revealBtn?.remove();
  }

  const transcriptEl = h('div', { class: 'card', style: { display: 'none' } });
  const message = h('div', { class: 'small', role: 'status', style: { color: 'var(--red)' } });
  const mic = h('button', { class: 'mic', 'aria-label': 'Aufnahme starten', onclick: toggle }, svg(ICONS.mic));
  const micLabel = h('div', { class: 'muted bold small center' }, 'Tippen und sprechen');

  function setRecording(on) {
    mic.classList.toggle('recording', on);
    mic.replaceChildren(svg(on ? ICONS.stop : ICONS.mic));
    mic.setAttribute('aria-label', on ? 'Aufnahme beenden' : 'Aufnahme starten');
    micLabel.textContent = on ? 'Tippen zum Beenden' : 'Tippen und sprechen';
  }

  function toggle() {
    if (locked) return;
    if (session) { session.stop(); return; }
    message.textContent = '';
    setRecording(true);
    session = listen({
      onText: (text) => {
        transcriptEl.style.display = '';
        transcriptEl.replaceChildren(h('div', { class: 'muted small bold' }, 'Verstanden:'), h('em', { lang: 'it' }, text));
      },
      onError: (msg) => { message.textContent = msg; },
      onEnd: (text) => {
        session = null;
        setRecording(false);
        if (text) evaluate(text);
      },
    });
  }

  function evaluate(text) {
    attempts++;
    const score = speechScore(text, sentence.it);
    const pct = Math.round(score * 100);
    const helped = memory && revealed;
    if (score >= 0.75) {
      finish({ correct: !helped, solution: sentence.it, note: helped ? `${pct} % erkannt – nächstes Mal ohne Lösung versuchen!` : `Aussprache: ${pct} % erkannt` });
    } else if (attempts >= 3) {
      finish({ correct: false, solution: sentence.it, note: `Nur ${pct} % erkannt – hör dir den Satz nochmal an.` });
    } else {
      message.textContent = `${pct} % erkannt – versuch es nochmal (Versuch ${attempts}/3).`;
    }
  }

  function finish(result) {
    locked = true;
    reveal();
    bottom.remove();
    ctx.onResult(result);
  }

  const bottom = recognitionSupported
    ? h('div', { class: 'bottom', style: { gap: '12px' } }, mic, micLabel, skipButton('Kann gerade nicht sprechen', ctx))
    : h('div', { class: 'bottom' },
        h('div', { class: 'card small' }, '🎙️ Spracherkennung ist hier nicht verfügbar. Sprich den Satz laut, zeig dann die Lösung und bewerte dich selbst.'),
        h('button', { class: 'btn', onclick: () => finish({ correct: true, solution: sentence.it, note: 'Selbst bewertet' }) }, 'Hab ich richtig gesagt'),
        h('button', { class: 'btn red', onclick: () => finish({ correct: false, solution: sentence.it }) }, 'Wusste ich nicht'),
        skipButton('Überspringen', ctx));

  return screen(
    h('div', { class: 'instruction' }, memory ? 'Sag das auf Italienisch' : 'Sprich diesen Satz'),
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '14px' } },
      speakBtn,
      h('div', { class: 'col', style: { gap: '4px' } }, memory ? german : italian, memory ? italian : german, revealBtn)),
    transcriptEl,
    message,
    bottom,
  );
}
