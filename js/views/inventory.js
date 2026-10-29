import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, options, emptyState, modal, toast, errToast, busy } from '../ui.js';

export async function render(el, ctx) {
  const ces = ctx.session.area === 'CESANTONI';
  let canEdit = ces;
  let tab = ctx.query.tab || 'physical';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('inv.title')}</h1><p>${t('inv.sub')}</p></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field search"><span>${t('common.search')}</span><input class="input" name="q" placeholder="${t('inv.searchPh')}" value="${ctx.query.q || ''}"></label>
      <label class="field"><span>${t('common.location')}</span><select class="input" name="location" data-loc><option value="">${t('common.all')}</option></select></label>
      <label class="field"><span>${t('inv.state')}</span><select class="input" name="state">${options(['AVAILABLE', 'LOW', 'OUT_OF_STOCK'].map((s) => ({ value: s, label: t('is.' + s) })), '', { all: t('common.all') })}</select></label>
    </form></div>
    <div class="callout info" data-sheetsnote hidden style="margin-bottom:18px">${icon('info')}<span>${t('inv.sheetsNote')}</span></div>
    <div class="card"><div class="tabs" data-tabs></div><div data-body></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let data;
  const load = async () => {
    data = await api(`/inventory${qs(Object.fromEntries(new FormData(form).entries()))}`);
    canEdit = ces && !data.sheets;
    el.querySelector('[data-sheetsnote]').hidden = !data.sheets;
    el.querySelector('.page-head p').textContent = t(data.sheets ? 'inv.subSheets' : 'inv.sub');
    const loc = el.querySelector('[data-loc]'); const keep = loc.value;
    loc.innerHTML = `<option value="">${esc(t('common.all'))}</option>` + data.locations.map((l) => `<option ${l === keep ? 'selected' : ''}>${esc(l)}</option>`).join('');
    draw();
  };
  const draw = async (itemId) => {
    el.querySelector('[data-tabs]').innerHTML = [['physical', 'inv.physical', data.physical.length], ['movements', 'inv.movements'], ['catalog', 'inv.catalog', data.items.length]].map(([k, l, n]) => `<button class="${k === tab ? 'on' : ''}" data-t="${k}">${esc(t(l))}${n !== undefined ? `<span class="count">${n}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; draw(); }));
    const body = el.querySelector('[data-body]');
    const tone = { AVAILABLE: 'green', LOW: 'amber', OUT_OF_STOCK: 'red' };
    if (tab === 'catalog') {
      body.innerHTML = data.items.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.sku')}</th><th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('inv.format')}</th><th>${t('inv.type')}</th><th>${t('common.location')}</th><th class="num">${t('inv.onHand')}</th><th>${t('inv.state')}</th>${canEdit ? html`<th></th>` : ''}</tr></thead><tbody>
        ${raw(data.items.map((i) => html`<tr class="click" data-item="${i.itemId}"><td data-l="${t('common.sku')}" class="mono">${i.sku || t('common.notRegistered')}</td><td data-l="${t('common.model')}" class="strong">${i.model}</td><td data-l="${t('common.color')}">${i.color}</td><td data-l="${t('inv.format')}">${i.format}</td><td data-l="${t('inv.type')}">${i.sampleType}</td><td data-l="${t('common.location')}">${i.location || '—'}${i.backupLocation ? raw(`<div class="small muted">${esc(t('inv.backup'))}: ${esc(i.backupLocation)}</div>`) : ''}</td><td data-l="${t('inv.onHand')}" class="num strong">${i.onHand}</td><td data-l="${t('inv.state')}"><span class="badge ${tone[i.state]}">${t('is.' + i.state)}</span>${i.inSource === false ? raw(' <span class="badge">not in source</span>') : ''}</td>${canEdit ? html`<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-adj="${i.itemId}">${t('inv.adjust')}</button></td>` : ''}</tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
      body.querySelectorAll('[data-item]').forEach((tr) => tr.addEventListener('click', (e) => { if (e.target.closest('[data-adj]')) return; tab = 'movements'; draw(tr.dataset.item); }));
      body.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => adjust(data.items.find((i) => i.itemId === b.dataset.adj))));
    } else if (tab === 'physical') {
      const kind = (p) => [p.cut20 ? '20×20 CUT' : '', p.fullPiece ? 'STANDARD' : ''].filter(Boolean).join(' · ') || '—';
      const byRef = data.physical.some((p) => p.reference && !p.cabinet);
      const where = (p) => (byRef ? html`<td data-l="${t('inv.reference')}" class="mono small" style="white-space:nowrap">${p.reference || '—'}</td><td data-l="${t('inv.sourceRow')}" class="small">${p.sourceRow ?? '—'}</td>` : html`<td data-l="${t('inv.cabinet')}">${p.cabinet}</td><td data-l="${t('inv.position')}">${p.position}</td>`);
      body.innerHTML = data.physical.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr>${byRef ? html`<th>${t('inv.reference')}</th><th>${t('inv.sourceRow')}</th>` : html`<th>${t('inv.cabinet')}</th><th>${t('inv.position')}</th>`}<th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('inv.finish')}</th><th>${t('inv.sampleSize')}</th><th>${t('inv.type')}</th><th class="num">${t('inv.onHand')}</th><th>${t('inv.state')}</th>${canEdit ? html`<th></th>` : ''}</tr></thead><tbody>
        ${raw(data.physical.map((p, i) => html`<tr>${where(p)}<td data-l="${t('common.model')}" class="strong">${p.model}</td><td data-l="${t('common.color')}">${p.color || '—'}</td><td data-l="${t('inv.finish')}">${p.finish || '—'}</td><td data-l="${t('inv.sampleSize')}">${p.sampleSize || '—'}</td><td data-l="${t('inv.type')}" class="small">${kind(p)}</td><td data-l="${t('inv.onHand')}" class="num strong">${p.quantity ?? '—'}</td><td data-l="${t('inv.state')}"><span class="badge ${tone[p.state]}">${t('is.' + p.state)}</span></td>${canEdit ? html`<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-padj="${i}">${t('inv.adjust')}</button></td>` : ''}</tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
      body.querySelectorAll('[data-padj]').forEach((b) => b.addEventListener('click', () => adjustPlace(data.physical[Number(b.dataset.padj)])));
    } else {
      const { movements } = await api(`/inventory/movements${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`);
      body.innerHTML = movements.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.date')}</th><th>${t('inv.type2')}</th><th>${t('common.model')}</th><th class="num">${t('common.qty')}</th><th>${t('common.request')}</th><th>${t('common.area')}</th></tr></thead><tbody>
        ${raw(movements.map((m) => html`<tr><td data-l="${t('common.date')}">${fmtDate(m.at)}</td><td data-l="${t('inv.type2')}"><span class="badge ${m.type === 'ISSUE' ? 'dark' : ['RETURN', 'RECEIPT'].includes(m.type) ? 'green' : m.type === 'RESERVE' ? 'amber' : ''}" title="${m.note || ''}">${m.source === 'BASE' ? t('mv.BASE') : m.source === 'SHEETS' ? t('mv.SHEETS') : m.source === 'INITIAL' ? t('mv.INITIAL') : m.source === 'BASE_IGNORED' ? t('mv.BASE_IGNORED') : m.source === 'AUTO' && m.type === 'ISSUE' ? t('mv.AUTO') : t('mv.' + m.type)}</span></td><td data-l="${t('common.model')}">${m.item}</td><td data-l="${t('common.qty')}" class="num">${m.qty}</td><td data-l="${t('common.request')}"><a href="#/requests/${encodeURIComponent(m.requestNo)}">${m.requestNo}</a></td><td data-l="${t('common.area')}">${m.area}</td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
    }
  };
  // CESANTONI: samples received or physical count. The difference is recorded as a movement.
  function adjust(item) {
    const m = modal({ title: `${t('inv.adjust')} · ${item.model} · ${item.color}`, body: html`<form class="form-grid" data-adjf>
      <p class="small muted" style="grid-column:1/-1;margin:0">${item.sampleType} · ${item.location || '—'} · ${t('inv.onHand')}: <strong>${item.onHand}</strong></p>
      <label class="field"><span>${t('inv.newQty')}</span><input class="input" type="number" min="0" step="1" name="newQty" value="${item.onHand}" required></label>
      <label class="field"><span>${t('inv.reason')}</span><input class="input" name="reason" maxlength="300" placeholder="${t('inv.reasonPh')}" required></label>
      <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>`.s });
    const f = m.body.querySelector('[data-adjf]');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(f.querySelector('[type=submit]'), async () => {
        try { await api('/inventory/adjust', { method: 'POST', body: { itemId: item.itemId, newQty: Number(f.newQty.value), reason: f.reason.value } }); toast(t('common.saved'), 'ok'); m.close(); load(); } catch (err) { errToast(err); }
      });
    });
  }
  function adjustPlace(p) {
    const m = modal({ title: `${t('inv.adjust')} · Mueble ${p.cabinet} · Pos. ${p.position}`, body: html`<form class="form-grid" data-adjf>
      <p class="small muted" style="grid-column:1/-1;margin:0">${p.model} ${p.color || ''} · ${p.finish || ''} · ${p.sampleSize || ''} · ${t('inv.onHand')}: <strong>${p.quantity ?? 0}</strong></p>
      <label class="field"><span>${t('inv.newQty')}</span><input class="input" type="number" min="0" step="1" name="newQty" value="${p.quantity ?? 0}" required></label>
      <label class="field"><span>${t('inv.reason')}</span><input class="input" name="reason" maxlength="300" placeholder="${t('inv.reasonPh')}" required></label>
      <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>`.s });
    const f = m.body.querySelector('[data-adjf]');
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(f.querySelector('[type=submit]'), async () => {
        try { await api('/inventory/physical-adjust', { method: 'POST', body: { cabinet: p.cabinet, position: p.position, model: p.model, newQty: Number(f.newQty.value), reason: f.reason.value } }); toast(t('common.saved'), 'ok'); m.close(); load(); } catch (err) { errToast(err); }
      });
    });
  }
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
  form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}
