import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, statusBadge, modal, toast, emptyState } from '../ui.js';
import { mountUploader } from '../media.js';
import { trackingForm } from './shipping-forms.js';
import { drawQr, qrText, canvasToPng } from '../labels.js';

const DELIVERY_TYPES = { COURIER: ['DELIVERY_PROOF'], PICKUP: ['PICKUP_CONFIRMATION', 'COLLECTION_PROOF', 'DELIVERED_MATERIAL_PHOTO'], WAREHOUSE: ['HANDOVER_PROOF', 'DELIVERY_PROOF'] };

export async function render(el, ctx) {
  let current = ctx.query.request || '';
  let det = null;
  const { requests } = await api('/requests?active=1');
  const { alerts } = await api('/alerts');
  const returned = alerts.filter((a) => a.type === 'EVIDENCE_RETURNED');

  el.innerHTML = html`<div class="page-head"><div><h1>${t('cap.title')}</h1><p>${t('cap.sub')}</p></div></div>
    <div class="card"><form class="capture-search" data-search><input class="input" name="q" list="cap-list" placeholder="${t('cap.searchPh')}" value="${current}" autocomplete="off" aria-label="${t('cap.search')}">
      <datalist id="cap-list">${raw(requests.map((r) => `<option value="${esc(r.requestNo)}">${esc(r.company || r.customerName)} · ${esc(t('st.' + r.status))}</option>`).join(''))}</datalist>
      <button class="btn btn-primary" style="min-height:52px">${icon('search')}<span>${t('cap.search')}</span></button></form>
      ${returned.length ? html`<div class="callout danger" style="margin-top:14px">${icon('undo')}<span><strong>${t('cap.returned')}:</strong> ${raw(returned.map((a) => `<a href="#/capture?request=${encodeURIComponent(a.requestNo)}">${esc(a.requestNo)}</a>`).join(', '))}</span></div>` : ''}
    </div><div data-work></div>`.s;
  const work = el.querySelector('[data-work]');

  const pick = async (no) => {
    const hit = requests.find((r) => r.requestNo === no.trim().toUpperCase()) || requests.find((r) => [r.customerName, r.company].some((v) => v && v.toUpperCase().includes(no.trim().toUpperCase())));
    if (!hit) { work.innerHTML = emptyState(t('common.none')).s; return; }
    current = hit.requestNo;
    history.replaceState(null, '', `#/capture?request=${encodeURIComponent(current)}`);
    det = await api(`/requests/${encodeURIComponent(current)}`);
    draw();
  };
  const refresh = async () => { det = await api(`/requests/${encodeURIComponent(current)}`); draw(); ctx.refreshBadges(); };

  function draw() {
    const has = (pred) => det.evidence.some((e) => !e.supersededBy && e.state !== 'RETURNED' && pred(e));
    const btn = (key, ic, done) => `<button class="cap-btn ${done ? 'done' : ''}" data-act="${key}"><span class="ic">${icon(done ? 'check' : ic).s}</span><span class="t">${esc(t('cap.' + key))}</span></button>`;
    const ret = det.evidence.filter((e) => e.state === 'RETURNED' && !e.supersededBy);
    work.innerHTML = html`<div class="req-pill"><span class="folio">${det.requestNo}</span>${statusBadge(det.status)}<span>${det.company || det.customerName}</span><span class="small" style="opacity:.75">${det.lines.length} ${t('common.products').toLowerCase()} · ${det.pieces} ${t('common.pieces').toLowerCase()}</span>
      <a class="btn btn-ghost btn-sm" style="margin-left:auto" href="#/requests/${encodeURIComponent(det.requestNo)}">${t('common.open')}</a></div>
      ${ret.length ? html`<div class="callout danger" style="margin-top:14px">${icon('undo')}<div>${raw(ret.map((e) => `<div><strong>${esc(e.typeLabel)}</strong>: ${esc(e.review?.notes || '')} <button class="btn btn-primary btn-sm" data-fix="${esc(e.id)}">${esc(t('det.uploadCorrection'))}</button></div>`).join(''))}</div></div>` : ''}
      <div class="capture-grid">${raw([
        btn('material', 'box', false), btn('inventory', 'inventory', det.lines.every((l) => l.reservedQty >= l.pieces)),
        btn('prep', 'capture', has((e) => e.stage === 'PREPARATION')), btn('pack', 'box', has((e) => e.stage === 'PACKAGING')),
        btn('label', 'truck', has((e) => e.type === 'SHIPPING_LABEL_PHOTO') && det.trackingNo), btn('delivery', 'check', has((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage))),
        btn('qr', 'qr', false),
      ].join(''))}</div>`.s;
    work.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => action(b.dataset.act)));
    work.querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', () => {
      const e = det.evidence.find((x) => x.id === b.dataset.fix);
      const m = modal({ title: t('det.uploadCorrection'), body: '<div data-up></div>' });
      mountUploader(m.body.querySelector('[data-up]'), { requestNo: det.requestNo, types: [e.type], meta: ctx.meta, replaces: e.id, compact: true, autoCamera: false, onSaved: () => { m.close(); refresh(); } });
    }));
  }

  function upload(title, types) {
    const m = modal({ title: `${title} · ${det.requestNo}`, body: '<div data-up></div>' });
    mountUploader(m.body.querySelector('[data-up]'), { requestNo: det.requestNo, types, meta: ctx.meta, compact: false, onSaved: () => { m.close(); refresh(); } });
  }

  function action(a) {
    if (a === 'material') {
      modal({ title: `${t('cap.material')} · ${det.requestNo}`, body: html`<div class="checklist">${raw(det.lines.map((l) => `<div class="item" style="flex-wrap:wrap"><span class="strong">${l.line}.</span><span class="lbl"><strong>${esc(l.model)}</strong> · ${esc(l.color)}<br><span class="small muted">${esc(l.pieceSize)} · SKU ${esc(l.sku || t('common.notRegistered'))}</span></span><span class="badge dark">${l.pieces} pcs</span><span class="badge orange">${icon('pin').s} ${esc(l.location || '—')}</span></div>`).join(''))}</div>`.s });
    } else if (a === 'inventory') {
      modal({ title: `${t('cap.inventory')} · ${det.requestNo}`, wide: true, body: html`${raw(det.lines.map((l) => `<h3 style="margin:10px 0 6px">${l.line}. ${esc(l.model)} · ${esc(l.color)} — ${l.pieces} pcs ${l.shortage ? `<span class="badge red">${esc(t('det.shortage'))}</span>` : ''}</h3>${l.candidates.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>${esc(t('common.location'))}</th><th>${esc(t('inv.type'))}</th><th class="num">${esc(t('det.available'))}</th></tr></thead><tbody>${l.candidates.map((c) => `<tr><td>${esc(c.location || '—')}</td><td>${esc(c.sampleType)} · ${esc(c.format)}</td><td class="num">${c.available}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('det.noMatch'))}</p>`}`).join(''))}<p class="small" style="margin-top:14px"><a href="#/requests/${encodeURIComponent(det.requestNo)}?tab=inventory">${t('det.reserve')} →</a></p>`.s });
    } else if (a === 'prep') upload(t('cap.prep'), ctx.meta.stages.PREPARATION.filter((x) => x !== 'QUANTITY_CONFIRMATION'));
    else if (a === 'pack') upload(t('cap.pack'), ctx.meta.stages.PACKAGING);
    else if (a === 'label') {
      const m = modal({ title: `${t('cap.label')} · ${det.requestNo}`, wide: true, body: `<div data-tf></div><h3 style="margin:18px 0 8px">${esc(t('sh.label'))} / ${esc(t('sh.dropoff'))}</h3><div data-up></div>` });
      trackingForm(m.body.querySelector('[data-tf]'), { det, ctx, onSaved: async () => { toast(t('common.saved'), 'ok'); det = await api(`/requests/${encodeURIComponent(current)}`); } });
      mountUploader(m.body.querySelector('[data-up]'), { requestNo: det.requestNo, types: ['SHIPPING_LABEL_PHOTO', 'CARRIER_DROPOFF_PROOF'], meta: ctx.meta, onSaved: () => { m.close(); refresh(); } });
    } else if (a === 'delivery') upload(t('cap.delivery'), DELIVERY_TYPES[det.deliveryMode] || [...new Set(Object.values(DELIVERY_TYPES).flat())]);
    else if (a === 'qr') {
      const m = modal({ title: `${t('cap.qr')} · ${det.requestNo}`, body: html`<div class="checklist">${raw(det.lines.map((l) => `<div class="item"><span class="lbl">${l.line}. ${esc(l.model)} · ${esc(l.color)}</span><button class="btn btn-dark btn-sm" data-q="${l.line}">${icon('download').s} QR PNG</button></div>`).join(''))}</div><p class="small" style="margin-top:12px"><a href="#/labels?request=${encodeURIComponent(det.requestNo)}">${t('lb.labelPng')} / ${t('lb.print')} →</a></p>`.s });
      m.body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', async () => {
        const l = det.lines.find((x) => x.line === Number(b.dataset.q));
        const c = document.createElement('canvas'); drawQr(c, qrText({ requestNo: det.requestNo, ...l }), 900);
        await canvasToPng(c, `${det.requestNo}_L${l.line}_QR.png`);
      }));
    }
  }

  el.querySelector('[data-search]').addEventListener('submit', (e) => { e.preventDefault(); pick(e.target.q.value); });
  el.querySelector('[data-search] input').addEventListener('change', (e) => { if (requests.some((r) => r.requestNo === e.target.value.trim().toUpperCase())) pick(e.target.value); });
  if (current) await pick(current); else work.innerHTML = html`<div class="empty" style="margin-top:20px">${icon('capture')}${t('cap.pick')}</div>`.s;
}
