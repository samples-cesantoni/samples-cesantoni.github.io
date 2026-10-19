import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, esc, fmtDate, emptyState } from '../ui.js';

export async function render(el, ctx) {
  el.innerHTML = html`<div class="page-head"><div><h1>${t('act.title')}</h1><p>${t('act.sub')}</p></div>
    <label class="field" style="width:220px"><span>${t('common.request')}</span><input class="input" data-q placeholder="SMCES-0001" value="${ctx.query.request || ''}"></label></div><div class="card" data-list></div>`.s;
  const load = async () => {
    const q = el.querySelector('[data-q]').value.trim().toUpperCase();
    const { events } = await api(`/activity${q ? `?requestNo=${encodeURIComponent(q)}` : ''}`);
    const box = el.querySelector('[data-list]');
    box.innerHTML = events.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.date')}</th><th>${t('common.request')}</th><th>${t('act.event')}</th><th>${t('common.area')}</th></tr></thead><tbody>
      ${raw(events.map((e) => html`<tr><td data-l="${t('common.date')}" class="small">${fmtDate(e.at)}</td><td data-l="${t('common.request')}">${e.requestNo ? raw(`<a href="#/requests/${encodeURIComponent(e.requestNo)}">${esc(e.requestNo)}</a>`) : '—'}</td><td data-l="${t('act.event')}">${e.event}</td><td data-l="${t('common.area')}"><span class="badge ${e.area === 'CESANTONI' ? 'dark' : e.area === 'Warehouse' ? 'orange' : ''}">${e.area}</span></td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
  };
  let timer; el.querySelector('[data-q]').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  await load();
}
