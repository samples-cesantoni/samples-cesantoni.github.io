import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, sevBadge, emptyState, options } from '../ui.js';

// Executive alert center: one row per request (worst severity first) with every open issue listed, plus filters.
const SEV = ['CRITICAL', 'WARNING', 'INFO'];
const rank = (s) => SEV.indexOf(s);

export async function render(el, ctx) {
  const { alerts } = await api('/alerts');
  const types = [...new Set(alerts.map((a) => a.type))];
  let sev = '';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('al.title')}</h1><p>${t('al.sub')}</p></div></div>
    <div class="kpis exec-kpis" data-k></div>
    <div class="card" style="padding:14px 16px"><div class="toolbar">
      <input class="input" data-q placeholder="${t('req.searchPh')}" aria-label="${t('common.search')}">
      <select class="input" data-type style="max-width:260px" aria-label="${t('em.type')}">${options(types.map((x) => ({ value: x, label: t('at.' + x, x) })), '', { all: t('em.type') + ': ' + t('common.all') })}</select></div></div>
    <div class="card"><div class="card-head"><h2 data-count></h2></div><div data-list></div></div>`.s;
  const draw = () => {
    const ty = el.querySelector('[data-type]').value; const q = el.querySelector('[data-q]').value.trim().toUpperCase();
    el.querySelector('[data-k]').innerHTML = SEV.map((s) => `<button class="kpi ${s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'amber' : 'accent'} ${sev === s ? 'sel' : ''}" data-sev="${s}" style="text-align:left;cursor:pointer"><div class="k">${esc(t('sev.' + s))}</div><div class="v">${alerts.filter((a) => a.severity === s).length}</div><div class="s">${esc(t('al.folios', '{n} folios').replace('{n}', new Set(alerts.filter((a) => a.severity === s).map((a) => a.requestNo)).size))}</div></button>`).join('');
    el.querySelectorAll('[data-sev]').forEach((b) => b.addEventListener('click', () => { sev = sev === b.dataset.sev ? '' : b.dataset.sev; draw(); }));
    const list = alerts.filter((a) => (!sev || a.severity === sev) && (!ty || a.type === ty) && (!q || `${a.requestNo} ${a.message} ${t('at.' + a.type, a.type)}`.toUpperCase().includes(q)));
    const groups = new Map();
    for (const a of list) { const k = String(a.requestNo); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); }
    const rows = [...groups.entries()].map(([no, items]) => ({ no, items: items.sort((a, b) => rank(a.severity) - rank(b.severity)), worst: items.reduce((m, a) => Math.min(m, rank(a.severity)), 9) }))
      .sort((a, b) => a.worst - b.worst || b.items.length - a.items.length || a.no.localeCompare(b.no));
    el.querySelector('[data-count]').textContent = `${rows.length} ${t('al.withAlerts')} · ${list.length} ${t('al.alerts')}`;
    const box = el.querySelector('[data-list]');
    if (!rows.length) { box.innerHTML = emptyState(t('common.none'), 'check').s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards dense"><thead><tr><th>${t('common.request')}</th><th>${t('al.level')}</th><th>${t('al.issues')}</th><th></th></tr></thead><tbody>
      ${raw(rows.map((g) => { const first = g.no.split(/[ ,/]+/)[0]; const link = /^[A-Z]+-\d+$/.test(first); return html`<tr class="${link ? 'click' : ''}" data-no="${first}">
        <td data-l="${t('common.request')}" class="nowrap strong">${g.no}</td>
        <td data-l="${t('al.level')}">${sevBadge(SEV[g.worst])}</td>
        <td data-l="${t('al.issues')}"><ul class="issue-list">${raw(g.items.map((a) => `<li class="sev-${a.severity.toLowerCase()}"><span class="strong">${esc(t('at.' + a.type, a.type))}</span> <span class="muted">— ${esc(a.message)}</span></li>`).join(''))}</ul></td>
        <td class="nowrap" style="text-align:right">${link ? raw(`<span class="btn btn-ghost btn-sm">${esc(t('common.open'))} ${icon('chevron').s}</span>`) : ''}</td></tr>`.s; }).join(''))}</tbody></table></div>`.s;
    box.querySelectorAll('tr.click').forEach((tr) => tr.addEventListener('click', () => ctx.navigate(ctx.session.area === 'BODEGA' ? `capture?request=${tr.dataset.no}` : `requests/${tr.dataset.no}`)));
  };
  el.querySelector('[data-type]').addEventListener('change', draw);
  el.querySelector('[data-q]').addEventListener('input', draw);
  draw();
}
