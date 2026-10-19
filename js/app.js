import { api, setUnauthorizedHandler } from './api.js';
import * as backend from './backend.js';
import { t, getLang, setLang } from './i18n.js';
import { html, icon, esc, $, $$, toast, errToast, setTimeZone, raw } from './ui.js';

const VIEWS = {
  dashboard: () => import('./views/dashboard.js'),
  requests: () => import('./views/requests.js'),
  request: () => import('./views/request-detail.js'),
  inventory: () => import('./views/inventory.js'),
  capture: () => import('./views/capture.js'),
  validation: () => import('./views/validation.js'),
  status: () => import('./views/status.js'),
  shipments: () => import('./views/shipments.js'),
  labels: () => import('./views/labels.js'),
  notices: () => import('./views/notices.js'),
  emails: () => import('./views/emails.js'),
  alerts: () => import('./views/alerts.js'),
  duplicates: () => import('./views/duplicates.js'),
  billing: () => import('./views/billing.js'),
  reports: () => import('./views/reports.js'),
  activity: () => import('./views/activity.js'),
  settings: () => import('./views/settings.js'),
};

// Menu per area. The server enforces the same rules; this only shapes navigation.
const MENU = {
  CESANTONI: [
    ['nav.operation', [['dashboard', 'dashboard'], ['requests', 'requests'], ['inventory', 'inventory'], ['shipments', 'truck'], ['labels', 'qr']]],
    ['nav.control', [['validation', 'shield'], ['status', 'status'], ['notices', 'bell'], ['emails', 'mail'], ['alerts', 'alert'], ['duplicates', 'copy']]],
    ['nav.finance', [['billing', 'invoice'], ['reports', 'chart']]],
    ['nav.admin', [['activity', 'log'], ['settings', 'settings']]],
  ],
  BODEGA: [
    ['nav.operation', [['capture', 'capture'], ['requests', 'requests'], ['inventory', 'inventory'], ['shipments', 'truck'], ['labels', 'qr'], ['alerts', 'alert']]],
  ],
};
const HOME = { CESANTONI: 'dashboard', BODEGA: 'capture' };
const allowed = (area, route) => route === 'request' || MENU[area].some(([, items]) => items.some(([r]) => r === route));

const state = { session: null, meta: null, badges: {} };
const root = $('#app');

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, q] = h.split('?');
  const [route, ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { route: route || '', params, query: Object.fromEntries(new URLSearchParams(q || '')) };
}
export function navigate(path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); }

// mode: login | setup (first administrator) | forgot | change (temporary password)
function renderLogin(mode = 'login', notice = '') {
  document.title = 'CESANTONI | Samples Center';
  const fields = {
    login: html`<h2>${t('login.signin')}</h2><p class="muted" style="margin:0 0 22px">${t('login.sub')}</p>
      <label class="field"><span>${t('login.email')}</span><input class="input" name="correo" type="email" autocomplete="username" required></label>
      <label class="field" style="margin-top:14px"><span>${t('login.password')}</span><input class="input" name="clave" type="password" autocomplete="current-password" required></label>`,
    setup: html`<h2>${t('login.setupTitle')}</h2><p class="muted" style="margin:0 0 22px">${t('login.setupSub')}</p>
      <label class="field"><span>${t('login.email')}</span><input class="input" name="correo" type="email" autocomplete="username" required></label>
      <label class="field" style="margin-top:14px"><span>${t('login.password')}</span><input class="input" name="clave" type="password" autocomplete="new-password" required></label><p class="hint">${t('login.pwRule')}</p>`,
    forgot: html`<h2>${t('login.forgot')}</h2><p class="muted" style="margin:0 0 22px">${t('login.forgotSub')}</p>
      <label class="field"><span>${t('login.email')}</span><input class="input" name="correo" type="email" autocomplete="username" required></label>`,
    change: html`<h2>${t('login.changeTitle')}</h2><p class="muted" style="margin:0 0 22px">${t('login.changeSub')}</p>
      <label class="field"><span>${t('login.current')}</span><input class="input" name="actual" type="password" autocomplete="current-password" required></label>
      <label class="field" style="margin-top:14px"><span>${t('login.new')}</span><input class="input" name="nueva" type="password" autocomplete="new-password" required></label><p class="hint">${t('login.pwRule')}</p>`,
  }[mode];
  const submit = { login: t('login.signin'), setup: t('login.setupBtn'), forgot: t('login.send'), change: t('common.save') }[mode];
  root.innerHTML = html`<div class="login">
    <section class="login-brand">
      <div class="logo-box"><img src="assets/logo-cesantoni.png" alt="CESANTONI Porcelanato Premium"></div>
      <div><h1>${t('login.title')}</h1><p>${t('login.tagline')}</p></div>
      <div class="somos"><img src="assets/logo-somos-logistica.png" alt="Somos Logística CESANTONI"></div>
    </section>
    <section class="login-form"><form class="login-card" novalidate>
      <div class="lang">${langSwitch()}</div>
      ${fields}
      <p class="callout ok" data-ok ${notice ? '' : 'hidden'} style="margin-top:14px">${notice}</p>
      <p class="callout danger" data-err hidden style="margin-top:14px"></p>
      <button class="btn btn-primary" style="width:100%;margin-top:20px;min-height:46px" type="submit">${submit}</button>
      ${mode === 'login' ? html`<p style="margin-top:16px;text-align:center"><a href="#" data-forgot>${t('login.forgot')}</a></p>` : ''}
      ${mode === 'forgot' ? html`<p style="margin-top:16px;text-align:center"><a href="#" data-back>${t('common.back')}</a></p>` : ''}
    </form></section></div>`.s;
  bindLang(() => renderLogin(mode));
  const f = root.querySelector('form');
  f.querySelector('[data-forgot]')?.addEventListener('click', (e) => { e.preventDefault(); renderLogin('forgot'); });
  f.querySelector('[data-back]')?.addEventListener('click', (e) => { e.preventDefault(); renderLogin('login'); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    btn.classList.add('loading');
    try {
      if (mode === 'login') await backend.signIn(f.correo.value, f.clave.value);
      else if (mode === 'setup') await backend.firstAdmin(f.correo.value, f.clave.value);
      else if (mode === 'forgot') { await backend.resetPassword(f.correo.value); renderLogin('login', t('login.forgotSent')); return; }
      else if (mode === 'change') await backend.changePassword(f.actual.value, f.nueva.value);
      await boot();
    } catch (err) {
      const box = f.querySelector('[data-err]'); box.hidden = false;
      box.textContent = err.message || t('login.invalid');
    } finally { btn.classList.remove('loading'); }
  });
}

function langSwitch() {
  return html`<div class="lang-switch" role="group" aria-label="Language"><button type="button" data-lang="es" class="${getLang() === 'es' ? 'on' : ''}" aria-pressed="${getLang() === 'es'}">ES</button><button type="button" data-lang="en" class="${getLang() === 'en' ? 'on' : ''}" aria-pressed="${getLang() === 'en'}">EN</button></div>`;
}
function bindLang(rerender) {
  $$('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.lang === getLang()) return;
    setLang(b.dataset.lang);
    if (state.session) { renderShell(); route(); } else (rerender || renderLogin)();
  }));
}

function renderShell() {
  const s = state.session;
  let mini = false; try { mini = localStorage.getItem('cs.mini') === '1'; } catch { /* ignore */ }
  const banner = s.email.live
    ? (s.email.mode !== 'PRODUCTION' ? html`<div class="demo-banner">${icon('info')}<span>${t('test.banner')}</span></div>` : '')
    : html`<div class="demo-banner">${icon('info')}<span>${t('demo.banner')}</span></div>`;
  root.innerHTML = html`<div class="shell ${mini ? 'mini' : ''}">
    <aside class="sidebar" aria-label="Main menu">
      <div class="brand"><span class="logo-chip"><img src="assets/logo-cesantoni.png" alt="CESANTONI"></span><span class="mini-mark" aria-hidden="true">C</span></div>
      <nav class="nav">${raw(MENU[s.area].map(([g, items]) => `<div class="group">${esc(t(g))}</div>` + items.map(([r, ic]) => `<a href="#/${r}" data-route="${r}" title="${esc(t('nav.' + r))}">${icon(ic).s}<span class="nav-label">${esc(t('nav.' + r))}</span><span class="badge-dot" data-badge="${r}" hidden></span></a>`).join('')).join(''))}</nav>
      <div class="side-foot"><div class="somos"><img src="assets/logo-somos-logistica.png" alt="Somos Logística CESANTONI"></div></div>
    </aside>
    <div class="backdrop" data-backdrop></div>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn" data-menu aria-label="${t('menu.toggle')}" aria-expanded="${!mini}">${icon('menu')}</button>
        <div class="title" data-title></div>
        <div class="spacer"></div>
        <span class="area-chip ${s.area === 'BODEGA' ? 'bodega' : ''}">${t('area.' + s.area)}</span>
        ${langSwitch()}
        <button class="icon-btn" data-logout aria-label="${t('logout')}" title="${t('logout')}">${icon('logout')}</button>
      </header>
      ${banner}
      <main class="content" id="view" tabindex="-1"></main>
    </div></div>`.s;
  bindLang();
  const shell = $('.shell');
  const mobile = () => window.matchMedia('(max-width: 860px)').matches;
  $('[data-menu]').addEventListener('click', () => {
    if (mobile()) { shell.classList.toggle('mobile-open'); $('[data-menu]').setAttribute('aria-expanded', shell.classList.contains('mobile-open')); return; }
    shell.classList.toggle('mini');
    $('[data-menu]').setAttribute('aria-expanded', !shell.classList.contains('mini'));
    try { localStorage.setItem('cs.mini', shell.classList.contains('mini') ? '1' : '0'); } catch { /* ignore */ }
  });
  $('[data-backdrop]').addEventListener('click', () => shell.classList.remove('mobile-open'));
  $$('.nav a').forEach((a) => a.addEventListener('click', () => shell.classList.remove('mobile-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') shell.classList.remove('mobile-open'); });
  $('[data-logout]').addEventListener('click', async () => { await backend.signOut().catch(() => {}); state.session = null; location.hash = ''; renderLogin(); });
}

export async function refreshBadges() {
  try {
    const { alerts } = await api('/alerts');
    const crit = alerts.filter((a) => a.severity === 'CRITICAL').length;
    setBadge('alerts', crit);
    if (state.session.area === 'CESANTONI') {
      setBadge('validation', alerts.filter((a) => a.type === 'PENDING_REVIEW').reduce((s, a) => s + (Number((a.message.match(/^\d+/) || [0])[0]) || 0), 0));
      setBadge('emails', alerts.filter((a) => a.type === 'EMAIL_FAILED').length);
    } else setBadge('capture', alerts.filter((a) => a.type === 'EVIDENCE_RETURNED').length);
  } catch { /* badges are best-effort */ }
}
function setBadge(r, n) { const el = $(`[data-badge="${r}"]`); if (!el) return; el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n); }

let renderToken = 0;
async function route() {
  if (!state.session) return;
  const { route: r0, params, query } = parseHash();
  const area = state.session.area;
  let r = r0;
  if (!r) { navigate(HOME[area]); return; }
  if (r === 'requests' && params[0]) r = 'request';
  if (!VIEWS[r] || !allowed(area, r)) { if (VIEWS[r]) toast(t('err.FORBIDDEN'), 'err'); navigate(HOME[area]); return; }
  $$('.nav a').forEach((a) => { const on = a.dataset.route === (r === 'request' ? 'requests' : r); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const title = t('nav.' + (r === 'request' ? 'requests' : r));
  $('[data-title]').textContent = r === 'request' ? `${title} · ${params[0]}` : title;
  document.title = `CESANTONI | ${r === 'request' ? params[0] : title}`;
  const view = $('#view');
  const token = ++renderToken;
  view.innerHTML = `<div class="empty">${esc(t('common.loading'))}</div>`;
  try {
    const mod = await VIEWS[r]();
    if (token !== renderToken) return;
    await mod.render(view, { session: state.session, meta: state.meta, params, query, navigate, refreshBadges, isCurrent: () => token === renderToken });
    view.focus({ preventScroll: true });
  } catch (e) {
    if (token !== renderToken) return;
    view.innerHTML = html`<div class="callout danger">${icon('alert')}<span>${e.message || t('common.error')}</span></div>`.s;
    if (e.status !== 401) console.error(e);
  }
  refreshBadges();
}

async function boot() {
  root.innerHTML = `<div class="empty" style="padding-top:20vh">${esc(t('common.loading'))}</div>`;
  await backend.init();
  const user = await backend.restore().catch(() => null);
  if (!user) {
    const st = await backend.state();
    if (st.signedIn) await backend.signOut().catch(() => {});
    renderLogin(st.hasAdmin ? 'login' : 'setup', st.signedIn ? t('login.noAccess') : '');
    return;
  }
  if (user.cambiar_clave) { renderLogin('change'); return; }
  state.session = await api('/session');
  setTimeZone(state.session.timeZone);
  state.meta = await api('/meta');
  renderShell();
  route();
}
setUnauthorizedHandler(() => { if (state.session) { state.session = null; toast('Session expired', 'err'); renderLogin(); } });
window.addEventListener('hashchange', route);
window.addEventListener('unhandledrejection', (e) => { if (e.reason?.status) e.preventDefault(); });
boot().catch(errToast);
