import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, evBadge, viewFile, emptyState } from '../ui.js';
import { reviewDialog } from './shared.js';

export async function render(el, ctx) {
  let state = ctx.query.state || 'PENDING';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('val.title')}</h1><p>${t('val.sub')}</p></div></div><div class="card"><div class="tabs" data-tabs></div><div data-body></div></div>`.s;
  const load = async () => {
    const { evidence } = await api(`/validation?state=${state}`);
    el.querySelector('[data-tabs]').innerHTML = [['PENDING', 'val.pending'], ['APPROVED', 'val.approved'], ['RETURNED', 'val.returned']].map(([k, l]) => `<button class="${k === state ? 'on' : ''}" data-s="${k}">${esc(t(l))}${k === state ? `<span class="count">${evidence.length}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { state = b.dataset.s; load(); }));
    const body = el.querySelector('[data-body]');
    if (!evidence.length) { body.innerHTML = emptyState(t('common.none'), 'shield').s; return; }
    body.innerHTML = html`<div class="ev-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${raw(evidence.map((e) => `<div class="ev">
      <button class="thumb" type="button" data-view="${esc(e.id)}" ${e.file ? '' : 'disabled'}>${e.file ? (/^image\//.test(e.file.mime) ? `<img loading="lazy" data-file="${esc(e.file.id)}" alt="">` : `<span class="pdf">${icon('file').s}PDF</span>`) : `<span class="pdf" style="color:var(--green)">${icon('check').s}${esc((e.data?.lines || []).map((l) => `L${l.line}: ${l.qty}`).join(' · '))}</span>`}</button>
      <div class="body"><div class="t"><a href="#/requests/${encodeURIComponent(e.requestNo)}">${esc(e.requestNo)}</a> · ${esc(e.typeLabel)}</div><div class="m">${esc(e.stageLabel)} · ${esc(e.company || '')}</div><div class="m">${esc(fmtDate(e.uploadedAt))} · ${esc(e.area)}</div>
      <div>${evBadge(e.state).s}</div>${e.notes ? `<div class="m">${esc(e.notes)}</div>` : ''}${e.review?.notes ? `<div class="${e.state === 'RETURNED' ? 'note-box' : 'm'}">${esc(e.review.notes)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:8px">${e.file ? `<button class="btn btn-ghost btn-sm" data-view="${esc(e.id)}">${icon('eye').s}${esc(t('val.attachment'))}</button>` : ''}
      ${e.state === 'PENDING' ? `<button class="btn btn-success btn-sm" data-ok="${esc(e.id)}">${icon('check').s}${esc(t('val.approve'))}</button><button class="btn btn-danger btn-sm" data-ret="${esc(e.id)}">${icon('undo').s}${esc(t('val.return'))}</button>` : ''}</div></div></div>`).join(''))}</div>`.s;
    body.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { const e = evidence.find((x) => x.id === b.dataset.view); if (e.file) viewFile(e.file); }));
    const after = () => { load(); ctx.refreshBadges(); };
    body.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => reviewDialog(evidence.find((x) => x.id === b.dataset.ok), 'APPROVE', after)));
    body.querySelectorAll('[data-ret]').forEach((b) => b.addEventListener('click', () => reviewDialog(evidence.find((x) => x.id === b.dataset.ret), 'RETURN', after)));
  };
  await load();
}
