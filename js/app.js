// Einstiegspunkt: lädt den Kurs, zeigt Onboarding oder die Tabs.
import { h, svg, ICONS } from './ui.js';
import { loadCourse } from './course.js';
import { p, requestPersistence, reset } from './state.js';
import { learnView, practiceView, grammarView, profileView, backup, restoreButton } from './views.js';
import { onboardingView } from './onboarding.js';

const app = document.getElementById('app');
const TABS = [
  { id: 'learn', label: 'Lernen', icon: ICONS.home, view: learnView },
  { id: 'practice', label: 'Üben', icon: ICONS.dumbbell, view: practiceView },
  { id: 'grammar', label: 'Grammatik', icon: ICONS.book, view: grammarView },
  { id: 'profile', label: 'Profil', icon: ICONS.person, view: profileView },
];
let current = sessionStorage.getItem('parla.tab') || 'learn';

function render() {
  try {
    if (!p.hasOnboarded) {
      current = 'learn';
      sessionStorage.removeItem('parla.tab');
      app.replaceChildren(onboardingView(render));
      window.scrollTo(0, 0);
      return;
    }
    const scroll = window.scrollY;
    const tab = TABS.find(t => t.id === current) || TABS[0];
    const nav = h('nav', { class: 'tabbar', 'aria-label': 'Hauptnavigation' }, TABS.map(t => h('button', {
      class: `tab ${t.id === current ? 'active' : ''}`,
      'aria-current': t.id === current ? 'page' : null,
      onclick: () => {
        if (current === t.id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        current = t.id;
        sessionStorage.setItem('parla.tab', current);
        render();
        window.scrollTo(0, 0);
      },
    }, svg(t.icon), t.label)));
    app.replaceChildren(h('main', {}, tab.view(render)), nav);
    window.scrollTo(0, scroll);
  } catch (e) {
    emergency(e);
  }
}

/** Notfall-Bildschirm: falls die Daten kaputt sind, bleibt die App bedienbar. */
function emergency(error) {
  console.error(error);
  app.replaceChildren(h('div', { class: 'screen' },
    h('h1', { class: 'screen-title' }, 'Hoppla 🙈'),
    h('p', {}, 'Beim Anzeigen ist ein Fehler aufgetreten. Deine Daten sind wahrscheinlich noch da.'),
    h('pre', { class: 'small muted', style: { whiteSpace: 'pre-wrap' } }, String(error?.message || error)),
    h('button', { class: 'btn', onclick: () => location.reload() }, 'Neu laden'),
    h('button', { class: 'btn blue', onclick: () => backup() }, 'Fortschritt sichern'),
    ...restoreButton(() => location.reload(), 'btn-link'),
    h('button', { class: 'btn red', onclick: () => { if (confirm('Alles zurücksetzen?')) { reset(); location.reload(); } } }, 'Zurücksetzen'),
  ));
}

async function main() {
  try {
    await loadCourse();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'screen' }, h('h2', {}, 'Kurs konnte nicht geladen werden'), h('p', { class: 'muted' }, 'Bitte prüfe die Internetverbindung und lade die Seite neu.'),
      h('button', { class: 'btn', onclick: () => location.reload() }, 'Neu laden')));
    return;
  }
  render();
  requestPersistence();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // Neue Version aktiv → neu laden, sobald gerade keine Lektion läuft
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      const reload = () => { if (!document.querySelector('.lesson, .sheet')) { reloading = true; location.reload(); } else setTimeout(reload, 5000); };
      reload();
    });
  }
}

function toast(title, text) {
  if (document.querySelector('.toast')) return;
  const el = h('div', { class: 'toast', role: 'alert' },
    h('div', { class: 'bold' }, title), h('div', { class: 'small' }, text),
    h('button', { class: 'btn-link', style: { padding: '6px 0 0', textAlign: 'left' }, onclick: () => el.remove() }, 'OK'));
  document.body.append(el);
  setTimeout(() => el.remove(), 15000);
}
window.addEventListener('parla:novoice', () => toast('🇮🇹 Keine italienische Stimme',
  'Dein iPhone hat keine italienische Stimme, daher klingt die Aussprache falsch. Lade eine: Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen › Italienisch (z. B. „Alice“). Danach die App neu öffnen.'));

// Hinweis, wenn die Sprachausgabe stumm bleibt (meist Stummschalter oder Lautstärke)
window.addEventListener('parla:silent', () => {
  if (document.querySelector('.toast')) return;
  const toast = h('div', { class: 'toast', role: 'alert' },
    h('div', { class: 'bold' }, '🔇 Keine Sprachausgabe?'),
    h('div', { class: 'small' }, 'Prüfe den Stummschalter links am iPhone und die Lautstärke. Hilft das nicht: Profil › Stimme auf „Automatisch“ stellen bzw. eine andere Stimme testen.'),
    h('button', { class: 'btn-link', style: { padding: '6px 0 0', textAlign: 'left' }, onclick: () => toast.remove() }, 'OK'));
  document.body.append(toast);
  setTimeout(() => toast.remove(), 12000);
});

main();
