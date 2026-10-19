import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, esc, busy, toast, emptyState, fmtDate } from '../ui.js';

export async function render(el, ctx) {
  el.innerHTML = html`<div class="page-head"><div><h1>${t('dup.title')}</h1><p>${t('dup.sub')}</p></div></div><div data-list></div>`.s;
  const load = async () => {
    const { duplicates } = await api('/duplicates');
    const box = el.querySelector('[data-list]');
    if (!duplicates.length) { box.innerHTML = html`<div class="card">${emptyState(t('common.none'), 'copy')}</div>`.s; return; }
    box.innerHTML = raw(duplicates.map((d) => html`<div class="card"><div class="card-head"><div><h2>${raw(d.requests.map((n) => `<a href="#/requests/${encodeURIComponent(n)}">${esc(n)}</a>`).join(' / '))}</h2><p>${d.reasons.join(' · ')}</p></div><span class="badge ${d.score >= 8 ? 'red' : 'amber'}">${t('dup.score')}: ${d.score}</span></div>
      ${d.decision ? html`<div class="callout info">${t('common.status')}: <strong>${t({ NOT_DUPLICATE: 'dup.not', CONFIRMED_DUPLICATE: 'dup.confirmed', UNDER_REVIEW: 'dup.review' }[d.decision.decision])}</strong> · ${fmtDate(d.decision.at)} · CESANTONI ${d.decision.notes ? `· ${d.decision.notes}` : ''}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px" data-key="${d.key}"><input class="input" placeholder="${t('common.notes')}" style="max-width:320px" data-notes>
        <button class="btn btn-ghost btn-sm" data-d="NOT_DUPLICATE">${t('dup.not')}</button><button class="btn btn-ghost btn-sm" data-d="UNDER_REVIEW">${t('dup.review')}</button><button class="btn btn-danger btn-sm" data-d="CONFIRMED_DUPLICATE">${t('dup.confirmed')}</button></div></div>`.s).join('')).s;
    box.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { const wrap = b.closest('[data-key]'); await api('/duplicates/decision', { method: 'POST', body: { key: wrap.dataset.key, decision: b.dataset.d, notes: wrap.querySelector('[data-notes]').value } }); toast(t('common.saved'), 'ok'); load(); ctx.refreshBadges(); }).catch(() => {})));
  };
  await load();
}
