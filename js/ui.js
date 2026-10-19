import { t, getLang } from './i18n.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Tagged template: interpolations are escaped unless wrapped with raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
      else if (v !== false && v !== null && v !== undefined) out += esc(v);
    }
  });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  requests: '<path d="M9 4h6l1 2h3a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3z"/><path d="M8 12h8M8 16h5"/>',
  inventory: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  capture: '<path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  status: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
  bell: '<path d="M6 10a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  alert: '<path d="M12 3L2 20h20z"/><path d="M12 10v4M12 17v.01"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  invoice: '<path d="M6 3h9l4 4v14l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V4a1 1 0 0 1 1-1z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-5M12 16V8M16 16v-3"/>',
  log: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5"/><path d="M5 4h14"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M7 12h10"/>',
};
export function icon(name, cls = '') {
  return raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.info}</svg>`);
}

// ---------- formatting ----------
export const locale = () => (getLang() === 'es' ? 'es-MX' : 'en-US');
let TZ = 'America/Mexico_City';
export function setTimeZone(tz) { TZ = tz; }
export function fmtDate(iso, withTime = true) {
  if (!iso) return '—';
  const d = new Date(iso); if (isNaN(d)) return String(iso);
  return new Intl.DateTimeFormat(locale(), { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) }).format(d);
}
export function fmtDay(isoDate) { if (!isoDate) return '—'; const [y, m, d] = isoDate.split('-').map(Number); return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))); }
export const usd = (v) => (v === null || v === undefined || v === '' ? raw(`<span class="na">${esc(t('common.na'))}</span>`) : `USD ${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const num = (v, suffix = '') => (v === null || v === undefined ? raw(`<span class="na">${esc(t('common.na'))}</span>`) : `${Number(v).toLocaleString(locale())}${suffix}`);
export function todayIso() { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); return p; }

const STATUS_TONE = { RECEIVED: 'blue', PREPARING: 'amber', PREPARED: 'orange', READY_FOR_PICKUP: 'orange', SHIPPED: 'dark', IN_TRANSIT: 'dark', DELIVERED: 'green', ON_HOLD: 'red', CANCELLED: '' };
export const statusBadge = (s) => html`<span class="badge ${STATUS_TONE[s] || ''}">${t('st.' + s, s)}</span>`;
export const evBadge = (s) => html`<span class="badge ${{ APPROVED: 'green', PENDING: 'amber', RETURNED: 'red' }[s] || ''}">${t('ev.' + s, s)}</span>`;
export const clBadge = (s) => html`<span class="badge ${{ APPROVED: 'green', COMPLETE: 'green', PENDING_REVIEW: 'amber', RETURNED: 'red', MISSING: '' }[s] || ''}">${t('cl.' + s, s)}</span>`;
export const mailBadge = (s) => html`<span class="badge ${{ SENT: 'green', QUEUED: 'amber', FAILED: 'red', SENDING: 'blue' }[s] || ''}">${t('mail.' + s, s)}</span>`;
export const sevBadge = (s) => html`<span class="badge ${{ CRITICAL: 'red', WARNING: 'amber', INFO: 'blue' }[s] || ''}">${t('sev.' + s, s)}</span>`;
export const docProgress = (pct, light) => html`<div class="progress" title="${t('light.' + light)}"><span class="light ${light}"></span><div class="bar"><i class="${light}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div><span class="small">${pct}%</span></div>`;
export const modeLabel = (m) => t(m ? 'mode.' + m : 'mode.none');
export const emptyState = (msg = t('common.none'), ic = 'search') => html`<div class="empty">${icon(ic)}<div>${msg}</div></div>`;

// ---------- feedback ----------
export function toast(msg, kind = 'info', ms = 4200) {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`; el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
export function errToast(e) { toast(e?.code === 'FORBIDDEN' ? t('err.FORBIDDEN') : (e?.message || t('common.error')), 'err', 6000); }

export async function busy(btn, fn) {
  if (!btn || btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  try { return await fn(); } catch (e) { errToast(e); throw e; } finally { btn.classList.remove('loading'); }
}

export function modal({ title, body, foot, wide = false, onClose }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button></div><div class="modal-body">${body ?? ''}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const prev = document.activeElement;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose?.(); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  setTimeout(() => (bg.querySelector('input,select,textarea,button:not([data-close])') || bg.querySelector('[data-close]')).focus(), 30);
  return { el: bg, close, body: bg.querySelector('.modal-body') };
}
export function confirmDialog(message, { okText = t('common.confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title: t('common.confirm'), body: `<p style="margin:0">${esc(message)}</p>`, foot: `<button class="btn btn-ghost" data-close>${esc(t('common.cancel'))}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`, onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
  });
}
export async function viewFile(file) {
  const { fileUrl } = await import('./api.js');
  let url;
  try { url = await fileUrl(file.id); } catch (e) { errToast(e); return; }
  const body = /^image\//.test(file.mime) ? `<div class="viewer"><img src="${url}" alt="${esc(file.name)}"></div>` : `<div class="viewer"><iframe src="${url}" title="${esc(file.name)}"></iframe></div>`;
  modal({ title: file.name, body, wide: true, foot: `<a class="btn btn-ghost" href="${url}" download="${esc(file.name)}">${icon('download')}${esc(t('common.download'))}</a>` });
}
export function opKey() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)); }
export function options(list, selected, { all } = {}) {
  return raw((all ? `<option value="">${esc(all)}</option>` : '') + list.map((o) => { const v = typeof o === 'object' ? o.value : o; const l = typeof o === 'object' ? o.label : o; return `<option value="${esc(v)}" ${String(v) === String(selected ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join(''));
}
export function formData(form) { const o = {}; for (const [k, v] of new FormData(form).entries()) o[k] = typeof v === 'string' ? v.trim() : v; return o; }
