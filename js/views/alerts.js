import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, esc, sevBadge, emptyState, options } from '../ui.js';

export async function render(el, ctx) {
  const { alerts } = await api('/alerts');
  const types = [...new Set(alerts.map((a) => a.type))];
  el.innerHTML = html`<div class="page-head"><div><h1>${t('al.title')}</h1><p>${t('al.sub')}</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><label class="field" style="width:170px"><span>Severity</span><select class="input" data-sev>${options(['CRITICAL', 'WARNING', 'INFO'].map((s) => ({ value: s, label: t('sev.' + s) })), '', { all: t('common.all') })}</select></label>
    <label class="field" style="width:220px"><span>${t('em.type')}</span><select class="input" data-type>${options(types.map((x) => ({ value: x, label: t('at.' + x, x) })), '', { all: t('common.all') })}</select></label></div></div>
    <div class="kpis" style="margin-bottom:18px">${raw(['CRITICAL', 'WARNING', 'INFO'].map((s) => `<div class="kpi ${s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'amber' : ''}"><div class="k">${esc(t('sev.' + s))}</div><div class="v">${alerts.filter((a) => a.severity === s).length}</div></div>`).join(''))}</div>
    <div class="card" data-list></div>`.s;
  const draw = () => {
    const sev = el.querySelector('[data-sev]').value; const ty = el.querySelector('[data-type]').value;
    const list = alerts.filter((a) => (!sev || a.severity === sev) && (!ty || a.type === ty));
    const box = el.querySelector('[data-list]');
    if (!list.length) { box.innerHTML = emptyState(t('common.none'), 'check').s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr><th>Severity</th><th>${t('em.type')}</th><th>${t('common.request')}</th><th>${t('em.reason')}</th></tr></thead><tbody>
      ${raw(list.map((a) => { const first = String(a.requestNo).split(/[ ,/]+/)[0]; return html`<tr class="${/^[A-Z]+-\d+$/.test(first) ? 'click' : ''}" data-no="${first}"><td data-l="Severity">${sevBadge(a.severity)}</td><td data-l="${t('em.type')}" class="strong">${t('at.' + a.type, a.type)}</td><td data-l="${t('common.request')}">${a.requestNo}</td><td data-l="${t('em.reason')}" class="small">${a.message}</td></tr>`.s; }).join(''))}</tbody></table></div>`.s;
    box.querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', () => ctx.navigate(ctx.session.area === 'BODEGA' ? `capture?request=${tr.dataset.no}` : `requests/${tr.dataset.no}`)));
  };
  el.querySelectorAll('[data-sev],[data-type]').forEach((s) => s.addEventListener('change', draw));
  draw();
}
