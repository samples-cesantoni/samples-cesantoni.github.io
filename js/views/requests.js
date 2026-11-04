import { api, qs, saveBlob } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, statusBadge, docProgress, modeLabel, options, emptyState } from '../ui.js';

// Executive request list: status chips with counts, direct search, advanced filters on demand, export.
const CHIPS = ['', 'RECEIVED', 'PREPARING', 'PREPARED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'ON_HOLD', 'CANCELLED'];

export async function render(el, ctx) {
  const f = { q: '', status: '', light: '', mode: '', country: '', state: '', from: '', to: '', active: '', ...ctx.query };
  const adv = Boolean(f.light || f.mode || f.country || f.state || f.from || f.to || f.active);
  el.innerHTML = html`<div class="page-head"><div><h1>${t('req.title')}</h1><p>${t('req.sub')}</p></div>
      <div class="actions"><button class="btn btn-ghost" data-csv>${icon('download')}${t('req.export')}</button><a class="btn btn-ghost" href="solicitar/" target="_blank" rel="noopener">${icon('link')}${t('req.formLink')}</a></div></div>
    <div class="chips" data-chips role="tablist"></div>
    <div class="card" style="padding:14px 16px"><form data-f>
      <div class="toolbar"><input class="input" name="q" value="${f.q}" placeholder="${t('req.searchPh')}" aria-label="${t('common.search')}">
        <button type="button" class="btn btn-ghost" data-more aria-expanded="${adv}">${icon('settings')}${t('req.moreFilters')}</button></div>
      <div class="filters" data-adv style="margin-top:12px" ${adv ? '' : 'hidden'}>
        <label class="field"><span>${t('req.light')}</span><select class="input" name="light">${options(['GREEN', 'AMBER', 'RED'].map((s) => ({ value: s, label: t('light.' + s) })), f.light, { all: t('common.all') })}</select></label>
        <label class="field"><span>${t('common.mode')}</span><select class="input" name="mode">${options([...ctx.meta.deliveryModes.map((m) => ({ value: m, label: t('mode.' + m) })), { value: 'NONE', label: t('mode.none') }], f.mode, { all: t('common.all') })}</select></label>
        <label class="field"><span>${t('common.country')}</span><select class="input" name="country" data-country><option value="">${t('common.all')}</option></select></label>
        <label class="field"><span>${t('common.state')}</span><select class="input" name="state" data-state><option value="">${t('common.all')}</option></select></label>
        <label class="field"><span>${t('common.from')}</span><input class="input" type="date" name="from" value="${f.from}"></label>
        <label class="field"><span>${t('common.to')}</span><input class="input" type="date" name="to" value="${f.to}"></label>
        <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="active" value="1" ${f.active ? 'checked' : ''}><span>${t('req.activeOnly')}</span></label>
      </div></form></div>
    <div class="card"><div class="card-head"><h2 data-count></h2></div><div data-list></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let status = f.status;
  let rows = [];
  el.querySelector('[data-more]').addEventListener('click', (e) => { const a = el.querySelector('[data-adv]'); a.hidden = !a.hidden; e.currentTarget.setAttribute('aria-expanded', String(!a.hidden)); });

  const draw = () => {
    const counts = Object.fromEntries(CHIPS.map((s) => [s, s ? rows.filter((r) => r.status === s).length : rows.length]));
    el.querySelector('[data-chips]').innerHTML = CHIPS.filter((s) => !s || counts[s] || s === status).map((s) => `<button role="tab" class="chip ${s === status ? 'on' : ''}" data-st="${s}">${esc(s ? t('st.' + s) : t('common.all'))}<span>${counts[s]}</span></button>`).join('');
    el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { status = b.dataset.st; history.replaceState(null, '', `#/requests${status ? `?status=${status}` : ''}`); draw(); }));
    const list = rows.filter((r) => !status || r.status === status);
    el.querySelector('[data-count]').textContent = `${list.length} ${t('req.count')}`;
    const box = el.querySelector('[data-list]');
    if (!list.length) { box.innerHTML = emptyState().s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards dense"><thead><tr>
      <th>${t('common.request')}</th><th>${t('req.date')}</th><th>${t('common.customer')}</th><th>${t('req.destination')}</th><th class="num">${t('common.products')}</th><th>${t('req.delivery')}</th><th>${t('common.status')}</th><th>${t('common.documentation')}</th></tr></thead><tbody>
      ${raw(list.map((r) => html`<tr class="click" data-no="${r.requestNo}" tabindex="0">
        <td data-l="${t('common.request')}" class="nowrap"><span class="strong">${r.requestNo}</span>${r.overdue ? raw(` <span class="dot red" title="${esc(t('k.overdue'))}"></span>`) : ''}${r.sourceNotes || r.observations ? raw(` <span class="note-i" title="${esc(r.sourceNotes || '')}">${icon('info').s}</span>`) : ''}</td>
        <td data-l="${t('req.date')}" class="nowrap small">${fmtDate(r.createdAt)}</td>
        <td data-l="${t('common.customer')}"><div class="strong" style="font-weight:600">${r.company || r.customerName || '—'}</div>${r.company && r.customerName && r.company !== r.customerName ? raw(`<div class="small muted">${esc(r.customerName)}</div>`) : ''}</td>
        <td data-l="${t('req.destination')}" class="small">${[r.city, r.state].filter(Boolean).join(', ') || r.country || '—'}${r.city || r.state ? raw(`<div class="muted">${esc(r.country || '')}</div>`) : ''}</td>
        <td data-l="${t('common.products')}" class="num nowrap">${r.productCount} <span class="small muted">· ${r.pieces} ${t('common.pieces').toLowerCase()}</span></td>
        <td data-l="${t('req.delivery')}" class="small">${modeLabel(r.deliveryMode)}${r.trackingNo ? raw(`<div class="mono muted">${esc(r.carrier)} ${esc(r.trackingNo)}</div>`) : ''}</td>
        <td data-l="${t('common.status')}">${statusBadge(r.status)}</td>
        <td data-l="${t('common.documentation')}">${docProgress(r.docPct, r.light)}</td></tr>`.s).join(''))}
      </tbody></table></div>`.s;
    box.querySelectorAll('tr[data-no]').forEach((tr) => {
      const go = () => ctx.navigate(`requests/${tr.dataset.no}`);
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    });
  };
  const load = async () => {
    const data = Object.fromEntries(new FormData(form).entries());
    const res = await api(`/requests${qs(data)}`);
    if (!ctx.isCurrent()) return;
    const fillSel = (sel, list, v) => { sel.innerHTML = `<option value="">${esc(t('common.all'))}</option>` + list.map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join(''); };
    fillSel(el.querySelector('[data-country]'), res.options.countries, data.country);
    fillSel(el.querySelector('[data-state]'), res.options.states, data.state);
    rows = res.requests;
    draw();
  };
  el.querySelector('[data-csv]').addEventListener('click', () => {
    const list = rows.filter((r) => !status || r.status === status);
    const cols = ['Request number', 'Date', 'Company', 'Customer', 'City', 'State', 'Country', 'Products', 'Pieces', 'Delivery mode', 'Carrier', 'Tracking', 'Status', 'Documentation %'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(q).join(','), ...list.map((r) => [r.requestNo, r.createdAt, r.company, r.customerName, r.city, r.state, r.country, r.productCount, r.pieces, r.deliveryMode || '', r.carrier, r.trackingNo, r.status, r.docPct].map(q).join(','))].join('\r\n');
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `CESANTONI_Requests_${new Date().toISOString().slice(0, 10)}.csv`);
  });
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  form.addEventListener('submit', (e) => { e.preventDefault(); load(); });
  await load();
}
