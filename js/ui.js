// Kleine DOM-Helfer – bewusst ohne Framework.

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) el.style.setProperty(k.startsWith('--') ? k : k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v);
    } else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') el.innerHTML = value;
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(markup, cls = '') {
  const wrap = document.createElement('span');
  wrap.innerHTML = markup;
  const el = wrap.firstElementChild;
  if (cls) el.classList.add(cls);
  return el;
}

export const ICONS = {
  speaker: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/><path d="M14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  turtle: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="11" cy="13" rx="7" ry="5"/><circle cx="19.5" cy="11.5" r="2.5"/><rect x="5" y="16" width="3" height="4" rx="1.5"/><rect x="13" y="16" width="3" height="4" rx="1.5"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5z"/><rect x="11" y="18" width="2" height="4"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="9" width="3" height="6" rx="1"/><rect x="5" y="6" width="3" height="12" rx="1"/><rect x="8" y="11" width="8" height="2"/><rect x="16" y="6" width="3" height="12" rx="1"/><rect x="19" y="9" width="3" height="6" rx="1"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a2 2 0 0 1 2-2h13v16H6a1 1 0 0 0 0 2h13v2H6a3 3 0 0 1-3-3V4z"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4.5"/><path d="M3 21a9 9 0 0 1 18 0z"/></svg>',
};

export function speakButton(text, { size = '', slow = false, onSpeak } = {}) {
  return h('button', {
    class: `speak-btn ${size}`,
    'aria-label': slow ? 'Langsam vorlesen' : 'Vorlesen',
    onclick: (e) => { e.stopPropagation(); onSpeak(text, slow); },
  }, svg(slow ? ICONS.turtle : ICONS.speaker));
}

/** Minimal-Markdown: **fett**, *kursiv*, ~~durchgestrichen~~, Absätze, Zeilenumbrüche. */
export function markdown(text) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = esc
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  return inline.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function haptic(pattern = 10) {
  try { navigator.vibrate?.(pattern); } catch { /* iOS unterstützt das nicht */ }
}

export function openSheet(content, { onClose } = {}) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const sheet = h('div', { class: 'sheet' },
    h('div', { class: 'sheet-handle' }),
    h('button', { class: 'sheet-close', onclick: close }, 'Fertig'),
    content,
  );
  backdrop.addEventListener('click', close);
  document.body.append(backdrop, sheet);
  document.body.classList.add('no-scroll');
  function close() {
    backdrop.remove();
    sheet.remove();
    if (!document.querySelector('.lesson')) document.body.classList.remove('no-scroll');
    onClose?.();
  }
  return close;
}
