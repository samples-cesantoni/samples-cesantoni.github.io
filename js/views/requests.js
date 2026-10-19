import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, statusBadge, docProgress, modeLabel, options, emptyState } from '../ui.js';

export async function render(el, ctx) {
  const f = { q: '', status: '', light: '', mode: '', country: '', state: '', from: '', to: '', active: '', ...ctx.query };
  el.innerHTML = html`<div class="page-head"><div><h1>${t('req.title')}</h1><p>${t('req.sub')}</p></div></div>
  <div class="card"><form class="filters" data-f>
    <label class="field search"><span>${t('common.search')}</span><input class="input" name="q" value="${f.q}" placeholder="${t('req.searchPh')}"></label>
    <label class="field"><span>${t('common.status')}</span><select class="input" name="status">${options(ctx.meta.statuses.map((s) => ({ value: s, label: t('st.' + s) })), f.status, { all: t('common.all') })}</select></label>
    <label class="field"><span>${t('req.light')}</span><select class="input" name="light">${options(['GREEN', 'AMBER', 'RED'].map((s) => ({ value: s, label: t('light.' + s) })), f.light, { all: t('common.all') })}</select></label>
    <label class="field"><span>${t('common.mode')}</span><select class="input" name="mode">${options([...ctx.meta.deliveryModes.map((m) => ({ value: m, label: t('mode.' + m) })), { value: 'NONE', label: t('mode.none') }], f.mode, { all: t('common.all') })}</select></label>
    <label class="field"><span>${t('common.country')}</span><select class="input" name="country" data-country><option value="">${t('common.all')}</option></select></label>
    <label class="field"><span>${t('common.state')}</span><select class="input" name="state" data-state><option value="">${t('common.all')}</option></select></label>
    <label class="field"><span>${t('common.from')}</span><input class="input" type="date" name="from" value="${f.from}"></label>
    <label class="field"><span>${t('common.to')}</span><input class="input" type="date" name="to" value="${f.to}"></label>
    <label class="check" style="align-self:center"><input type="checkbox" name="active" value="1" ${f.active ? 'checked' : ''}><span>${t('req.activeOnly')}</span></label>
  </form></div>
  <div class="card"><div class="card-head"><h2 data-count></h2></div><div data-list></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let timer;
  const load = async () => {
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api(`/requests${qs(data)}`);
    if (!ctx.isCurrent()) return;
    const fillSel = (sel, list, v) => { const keep = v; sel.innerHTML = `<option value="">${esc(t('common.all'))}</option>` + list.map((x) => `<option ${x === keep ? 'selected' : ''}>${esc(x)}</option>`).join(''); };
    fillSel(el.querySelector('[data-country]'), res.options.countries, data.country);
    fillSel(el.querySelector('[data-state]'), res.options.states, data.state);
    el.querySelector('[data-count]').textContent = `${res.requests.length} ${t('req.count')}`;
    const list = el.querySelector('[data-list]');
    if (!res.requests.length) { list.innerHTML = emptyState().s; return; }
    list.innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr>
      <th>${t('common.request')}</th><th>${t('req.date')}</th><th>${t('common.customer')}</th><th>${t('common.country')} / ${t('common.state')}</th><th>${t('common.mode')}</th><th class="num">${t('common.products')}</th><th>${t('common.status')}</th><th>${t('common.documentation')}</th><th>${t('common.observations')}</th></tr></thead><tbody>
      ${raw(res.requests.map((r) => html`<tr class="click" data-no="${r.requestNo}" tabindex="0">
        <td data-l="${t('common.request')}"><span class="strong">${r.requestNo}</span>${r.overdue ? raw(' <span class="badge red">!</span>') : ''}</td>
        <td data-l="${t('req.date')}">${fmtDate(r.createdAt)}</td>
        <td data-l="${t('common.customer')}"><div>${r.customerName || '—'}</div><div class="small muted">${r.company}</div></td>
        <td data-l="${t('common.country')}">${[r.country, r.state, r.city].filter(Boolean).join(' · ') || '—'}<div class="small muted">${r.address}</div></td>
        <td data-l="${t('common.mode')}">${modeLabel(r.deliveryMode)}</td>
        <td data-l="${t('common.products')}" class="num">${r.productCount} <span class="small muted">(${r.pieces} ${t('common.pieces').toLowerCase()})</span></td>
        <td data-l="${t('common.status')}">${statusBadge(r.status)}</td>
        <td data-l="${t('common.documentation')}">${docProgress(r.docPct, r.light)}</td>
        <td data-l="${t('common.observations')}" class="small">${r.sourceNotes ? r.sourceNotes : ''}${r.observations ? ` (+${r.observations})` : ''}</td></tr>`.s).join(''))}
      </tbody></table></div>`.s;
    list.querySelectorAll('tr[data-no]').forEach((tr) => {
      const go = () => ctx.navigate(`requests/${tr.dataset.no}`);
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  };
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  await load();
}
