import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, esc, fmtDate, options, emptyState } from '../ui.js';

export async function render(el, ctx) {
  let tab = ctx.query.tab || 'catalog';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('inv.title')}</h1><p>${t('inv.sub')}</p></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field search"><span>${t('common.search')}</span><input class="input" name="q" placeholder="${t('inv.searchPh')}" value="${ctx.query.q || ''}"></label>
      <label class="field"><span>${t('common.location')}</span><select class="input" name="location" data-loc><option value="">${t('common.all')}</option></select></label>
      <label class="field"><span>${t('inv.state')}</span><select class="input" name="state">${options(['AVAILABLE', 'LOW', 'OUT_OF_STOCK'].map((s) => ({ value: s, label: t('is.' + s) })), '', { all: t('common.all') })}</select></label>
    </form></div>
    <div class="card"><div class="tabs" data-tabs></div><div data-body></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let data;
  const load = async () => {
    data = await api(`/inventory${qs(Object.fromEntries(new FormData(form).entries()))}`);
    const loc = el.querySelector('[data-loc]'); const keep = loc.value;
    loc.innerHTML = `<option value="">${esc(t('common.all'))}</option>` + data.locations.map((l) => `<option ${l === keep ? 'selected' : ''}>${esc(l)}</option>`).join('');
    draw();
  };
  const draw = async (itemId) => {
    el.querySelector('[data-tabs]').innerHTML = [['catalog', 'inv.catalog', data.items.length], ['physical', 'inv.physical', data.physical.length], ['movements', 'inv.movements']].map(([k, l, n]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${esc(t(l))}${n !== undefined ? `<span class="count">${n}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; draw(); }));
    const body = el.querySelector('[data-body]');
    const tone = { AVAILABLE: 'green', LOW: 'amber', OUT_OF_STOCK: 'red' };
    if (tab === 'catalog') {
      body.innerHTML = data.items.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.sku')}</th><th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('inv.format')}</th><th>${t('inv.type')}</th><th>${t('common.location')}</th><th class="num">${t('inv.onHand')}</th><th>${t('inv.state')}</th></tr></thead><tbody>
        ${raw(data.items.map((i) => html`<tr class="click" data-item="${i.itemId}"><td data-l="${t('common.sku')}" class="mono">${i.sku || t('common.notRegistered')}</td><td data-l="${t('common.model')}" class="strong">${i.model}</td><td data-l="${t('common.color')}">${i.color}</td><td data-l="${t('inv.format')}">${i.format}</td><td data-l="${t('inv.type')}">${i.sampleType}</td><td data-l="${t('common.location')}">${i.location || '—'}${i.backupLocation ? raw(`<div class="small muted">${esc(t('inv.backup'))}: ${esc(i.backupLocation)}</div>`) : ''}</td><td data-l="${t('inv.onHand')}" class="num strong">${i.onHand}</td><td data-l="${t('inv.state')}"><span class="badge ${tone[i.state]}">${t('is.' + i.state)}</span>${i.inSource === false ? raw(' <span class="badge">not in source</span>') : ''}</td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
      body.querySelectorAll('[data-item]').forEach((tr) => tr.addEventListener('click', () => { tab = 'movements'; draw(tr.dataset.item); }));
    } else if (tab === 'physical') {
      body.innerHTML = data.physical.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('inv.cabinet')}</th><th>${t('inv.position')}</th><th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('inv.finish')}</th><th>${t('inv.sampleSize')}</th><th class="num">${t('inv.onHand')}</th><th>${t('inv.backup')}</th><th>${t('common.status')}</th></tr></thead><tbody>
        ${raw(data.physical.map((p) => html`<tr><td data-l="${t('inv.cabinet')}">${p.cabinet}</td><td data-l="${t('inv.position')}">${p.position}</td><td data-l="${t('common.model')}" class="strong">${p.model}</td><td data-l="${t('common.color')}">${p.color || '—'}</td><td data-l="${t('inv.finish')}">${p.finish}</td><td data-l="${t('inv.sampleSize')}">${p.sampleSize}</td><td data-l="${t('inv.onHand')}" class="num">${p.quantity ?? '—'}</td><td data-l="${t('inv.backup')}">${p.backupLocation || '—'}</td><td data-l="${t('common.status')}"><span class="badge ${p.status === 'AVAILABLE' ? 'green' : 'red'}">${p.status}</span></td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
    } else {
      const { movements } = await api(`/inventory/movements${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`);
      body.innerHTML = movements.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.date')}</th><th>${t('inv.type2')}</th><th>${t('common.model')}</th><th class="num">${t('common.qty')}</th><th>${t('common.request')}</th><th>${t('common.area')}</th></tr></thead><tbody>
        ${raw(movements.map((m) => html`<tr><td data-l="${t('common.date')}">${fmtDate(m.at)}</td><td data-l="${t('inv.type2')}"><span class="badge ${m.type === 'ISSUE' ? 'dark' : m.type === 'RESERVE' ? 'amber' : ''}">${m.source === 'BASE' ? t('mv.BASE') : t('mv.' + m.type)}</span></td><td data-l="${t('common.model')}">${m.item}</td><td data-l="${t('common.qty')}" class="num">${m.qty}</td><td data-l="${t('common.request')}"><a href="#/requests/${encodeURIComponent(m.requestNo)}">${m.requestNo}</a></td><td data-l="${t('common.area')}">${m.area}</td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
    }
  };
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}
