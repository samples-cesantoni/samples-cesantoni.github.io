import { api, download } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, fmtDay, statusBadge, docProgress, modeLabel, options, toast, errToast, busy, usd, opKey, modal, viewFile, mailBadge, confirmDialog, todayIso } from '../ui.js';
import { mountUploader } from '../media.js';
import { timeline, checklistBlock, evidenceGrid, bindEvidence } from './shared.js';
import { trackingForm, deliveryForm } from './shipping-forms.js';

const TABS = ['general', 'products', 'inventory', 'prep', 'pack', 'ship', 'delivery', 'obs', 'history', 'docs'];
const DELIVERY_TYPES = { COURIER: ['DELIVERY_PROOF'], PICKUP: ['PICKUP_CONFIRMATION', 'COLLECTION_PROOF', 'DELIVERED_MATERIAL_PHOTO'], WAREHOUSE: ['HANDOVER_PROOF', 'DELIVERY_PROOF'] };

export async function render(el, ctx) {
  const no = ctx.params[0];
  let tab = TABS.includes(ctx.query.tab) ? ctx.query.tab : 'general';
  const area = ctx.session.area;
  let det;

  const load = async () => { det = await api(`/requests/${encodeURIComponent(no)}`); };
  const setTab = (x) => { tab = x; history.replaceState(null, '', `#/requests/${encodeURIComponent(no)}?tab=${x}`); draw(); };
  const reload = async () => { await load(); draw(); ctx.refreshBadges(); };

  function header() {
    return html`<div class="card"><div class="req-head"><div>
      <a href="#/requests" class="small">← ${t('req.title')}</a>
      <div class="folio">${det.requestNo}</div>
      <div class="meta">${statusBadge(det.status)}<span>${fmtDate(det.createdAt)}</span><span>·</span><span>${det.company || det.customerName}</span><span>·</span><span>${modeLabel(det.deliveryMode)}</span>${docProgress(det.checklist.pct, det.checklist.light)}</div>
    </div><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
      ${area === 'CESANTONI' ? html`<a class="btn btn-primary" href="#/status?request=${encodeURIComponent(det.requestNo)}">${icon('status')}${t('det.changeStatus')}</a>` : ''}
      <a class="btn btn-ghost" href="#/labels?request=${encodeURIComponent(det.requestNo)}">${icon('qr')}${t('det.labels')}</a>
      <button class="btn btn-dark" data-pdf>${icon('file')}${t('det.pdf')}</button>
    </div></div></div>`;
  }
  const count = (n) => (n ? `<span class="count">${n}</span>` : '');
  const evOf = (pred) => det.evidence.filter(pred);
  function tabs() {
    const n = { prep: evOf((e) => e.stage === 'PREPARATION' && !e.supersededBy).length, pack: evOf((e) => e.stage === 'PACKAGING' && !e.supersededBy).length, ship: evOf((e) => e.stage === 'SHIPPING' && !e.supersededBy).length, delivery: evOf((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage) && !e.supersededBy).length, obs: det.observationsList.length + (det.sourceNotes ? 1 : 0), docs: det.documents.length, products: det.lines.length };
    const label = { general: 'det.general', products: 'det.products', inventory: 'det.inventory', prep: 'det.prep', pack: 'det.pack', ship: 'det.ship', delivery: 'det.delivery', obs: 'det.obs', history: 'det.history', docs: 'det.docs' };
    return raw(`<div class="tabs" role="tablist">${TABS.map((x, i) => `<button role="tab" aria-selected="${x === tab}" class="${x === tab ? 'on' : ''}" data-tab="${x}">${i + 1}. ${esc(t(label[x]))}${count(n[x])}</button>`).join('')}</div>`);
  }

  function general() {
    const kv = [['common.request', det.requestNo], ['req.date', fmtDate(det.createdAt)], ['common.customer', det.customerName], ['common.company', det.company],
      ...(area === 'CESANTONI' ? [['det.email', det.customerEmail]] : []), ['det.phone', det.phone], ['common.country', det.country], ['common.state', det.state], ['common.city', det.city], ['det.zip', det.zip], ['req.address', det.address], ['det.refs', det.deliveryRefs]];
    return html`<div class="grid g2" style="align-items:start">
      <div class="card"><div class="card-head"><h2>${t('det.general')}</h2></div>
        <div class="kv">${raw(kv.map(([k, v]) => `<div><div class="k">${esc(t(k))}</div><div class="v">${esc(v || '—')}</div></div>`).join(''))}
          <div><div class="k">${t('common.mode')}</div><div class="v">${area === 'CESANTONI' ? html`<select class="input" data-mode style="min-height:34px;padding:5px 8px">${options([{ value: '', label: t('mode.none') }, ...['COURIER', 'PICKUP', 'WAREHOUSE'].map((m) => ({ value: m, label: t('mode.' + m) }))], det.deliveryMode || '')}</select>` : modeLabel(det.deliveryMode)}</div></div>
        </div>
        ${det.sourceNotes ? html`<div class="callout warn" style="margin-top:16px">${icon('info')}<span><strong>${t('det.sourceNotes')}:</strong> ${det.sourceNotes}</span></div>` : ''}
        ${det.notices.length ? raw(det.notices.map((n) => `<div class="callout info" style="margin-top:10px">${icon('bell').s}<span><strong>${esc(t('cat.' + n.category))}</strong> · ${esc(fmtDay(n.start))} – ${esc(fmtDay(n.end))}<br>${esc(n.message)}</span></div>`).join('')) : ''}
      </div>
      <div><div class="card"><div class="card-head"><h2>${t('det.timeline')}</h2></div>${timeline(det)}</div>
      <div class="card">${checklistBlock(det.checklist)}</div>
      ${area === 'CESANTONI' && det.duplicates?.length ? html`<div class="card"><div class="callout warn">${icon('copy')}<span><strong>${t('det.duplicates')}:</strong> ${det.duplicates.map((d) => `${d.requests.join(' / ')} — ${d.reasons.join(', ')}`).join(' · ')}</span></div></div>` : ''}
      </div></div>`;
  }

  function products() {
    return html`<div class="card"><div class="table-wrap"><table class="t cards"><thead><tr><th>#</th><th>${t('common.sku')}</th><th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('common.size')}</th><th class="num">${t('common.qty')}</th><th>${t('common.location')}</th></tr></thead><tbody>
      ${raw(det.lines.map((l) => html`<tr><td data-l="#">${l.line}</td><td data-l="${t('common.sku')}" class="mono">${l.sku || t('common.notRegistered')}</td><td data-l="${t('common.model')}" class="strong">${l.model}</td><td data-l="${t('common.color')}">${l.color}</td><td data-l="${t('common.size')}">${l.pieceSize}</td><td data-l="${t('common.qty')}" class="num">${l.pieces}</td><td data-l="${t('common.location')}">${l.location || '—'}</td></tr>`.s).join(''))}
      </tbody></table></div></div>`;
  }

  function inventory() {
    const head = html`<div class="callout info" style="margin-bottom:18px">${icon('info')}<span>${det.inventoryExcluded ? t('det.invExcluded') : det.inventoryByPlatform ? t('det.platformDeducts') : t('det.baseDeducts')}</span></div>
      ${area === 'CESANTONI' ? html`<label class="check" style="margin-bottom:18px"><input type="checkbox" data-invex ${det.inventoryExcluded ? 'checked' : ''}><span>${t('det.invExclude')}</span></label>` : ''}`.s;
    return raw(head + det.lines.map((l) => html`<div class="card" data-line="${l.line}">
      <div class="card-head"><div><h2>${l.line}. ${l.model}${l.color ? ` · ${l.color}` : ''}</h2><p>${l.pieceSize} · ${t('common.qty')}: ${l.pieces} · ${t('det.deducted')}: ${l.deductedQty}</p></div>
        ${l.deductedQty >= l.pieces ? html`<span class="badge green">${t('det.deductedOk')}</span>` : l.shortage ? html`<span class="badge red">${t('det.shortage')}</span>` : html`<span class="badge amber">${t('det.notDeducted')}</span>`}</div>
      ${l.deductions.length ? html`<div class="table-wrap" style="margin-bottom:14px"><table class="t cards"><thead><tr><th>${t('common.date')}</th><th>${t('common.location')}</th><th>${t('inv.type')}</th><th class="num">${t('common.qty')}</th><th class="num">${t('det.stockMove')}</th></tr></thead><tbody>
        ${raw(l.deductions.map((m) => html`<tr><td data-l="${t('common.date')}">${fmtDate(m.at, false)}</td><td data-l="${t('common.location')}">${m.location || '—'}</td><td data-l="${t('inv.type')}">${m.sampleType || '—'}</td><td data-l="${t('common.qty')}" class="num">${m.qty}</td><td data-l="${t('det.stockMove')}" class="num">${m.before ?? '—'} → ${m.after ?? '—'}</td></tr>`.s).join(''))}</tbody></table></div>` : ''}
      <h3 style="margin-bottom:8px">${t('det.candidates')}</h3>
      ${l.candidates.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.sku')}</th><th>${t('inv.format')}</th><th>${t('inv.type')}</th><th>${t('common.location')}</th><th class="num">${t('inv.onHand')}</th></tr></thead><tbody>
        ${raw(l.candidates.map((c) => html`<tr><td data-l="${t('common.sku')}" class="mono">${c.sku || t('common.notRegistered')}</td><td data-l="${t('inv.format')}">${c.format}</td><td data-l="${t('inv.type')}">${c.sampleType} ${c.preferred ? raw(`<span class="badge orange">${esc(t('det.preferred'))}</span>`) : ''}</td><td data-l="${t('common.location')}">${c.location || '—'}</td><td data-l="${t('inv.onHand')}" class="num"><span class="${c.onHand <= 0 ? 'badge red' : ''}">${c.onHand}</span></td></tr>`.s).join(''))}</tbody></table></div>` : html`<div class="callout warn">${icon('alert')}<span>${t('det.noMatch')}</span></div>`}
    </div>`.s).join(''));
  }

  function stagePanel(stage, types) {
    const list = evOf((e) => e.stage === stage);
    return html`<div class="grid g2" style="align-items:start"><div class="card"><div class="card-head"><h2>${t('up.save')}</h2></div><div data-uploader="${stage}" data-types="${types.join(',')}"></div></div>
      <div class="card"><div class="card-head"><h2>${t('det.' + (stage === 'PREPARATION' ? 'prep' : 'pack'))}</h2></div><div data-evlist>${evidenceGrid(list, { area })}</div></div></div>`;
  }
  function prep() {
    const confirmed = evOf((e) => e.type === 'QUANTITY_CONFIRMATION' && !e.supersededBy);
    return html`<div class="card"><div class="card-head"><div><h2>${t('det.qtyConfirm')}</h2><p>${confirmed.length ? `${fmtDate(confirmed[confirmed.length - 1].uploadedAt)} · ${confirmed[confirmed.length - 1].state}` : ''}</p></div></div>
      <form data-qtyform class="checklist">${raw(det.lines.map((l) => `<label class="item"><input type="checkbox" name="c${l.line}" style="width:18px;height:18px;accent-color:var(--orange)"><span class="lbl">${l.line}. ${esc(l.model)} · ${esc(l.color)} · ${esc(l.pieceSize)}</span><input class="input" type="number" min="0" name="q${l.line}" value="${l.pieces}" style="width:84px;min-height:32px;padding:4px 8px" aria-label="${esc(t('common.qty'))}"></label>`).join(''))}
      <div class="form-actions"><button class="btn btn-dark" type="submit">${icon('check')}${t('det.qtyConfirmBtn')}</button></div></form></div>
      ${stagePanel('PREPARATION', ctx.meta.stages.PREPARATION.filter((x) => x !== 'QUANTITY_CONFIRMATION'))}`;
  }

  function ship() {
    const list = evOf((e) => e.stage === 'SHIPPING');
    return html`<div class="grid g2" style="align-items:start">
      <div><div class="card"><div class="card-head"><div><h2>${t('det.ship')}</h2><p>${t('sh.estimateNote')}</p></div></div><div data-trackform></div></div>
      ${area === 'CESANTONI' ? html`<div class="card"><div class="card-head"><h2>${t('det.cost')}</h2></div>
        <form data-cost class="form-grid"><label class="field"><span>USD</span><input class="input" name="amountUsd" type="number" min="0" step="0.01" value="${det.cost?.amountUsd ?? ''}"></label><label class="field"><span>${t('common.notes')}</span><input class="input" name="notes" value="${det.cost?.notes || ''}"></label><div class="form-actions" style="grid-column:1/-1;margin-top:0"><button class="btn btn-dark" type="submit">${t('bil.setCost')}</button></div></form>
        ${det.invoices?.length ? html`<div style="margin-top:12px">${raw(det.invoices.map((i) => `<div class="small">${esc(t('det.invoices'))}: <strong>${esc(i.invoiceNo)}</strong> · ${esc(i.issueDate)} · ${esc(usd(i.totalUsd).toString())}${i.sharedWith > 1 ? ` · ${esc(t('bil.shared'))}` : ''}</div>`).join(''))}</div>` : ''}</div>` : ''}</div>
      <div><div class="card"><div class="card-head"><h2>${t('sh.label')} / ${t('sh.dropoff')}</h2></div><div data-uploader="SHIPPING" data-types="SHIPPING_LABEL_PHOTO,CARRIER_DROPOFF_PROOF"></div></div>
      <div class="card"><div data-evlist>${evidenceGrid(list, { area })}</div></div></div></div>`;
  }

  function delivery() {
    const types = DELIVERY_TYPES[det.deliveryMode] || [...new Set(Object.values(DELIVERY_TYPES).flat())];
    const list = evOf((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage));
    return html`<div class="grid g2" style="align-items:start">
      <div class="card"><div class="card-head"><h2>${t('det.delivery')}</h2></div><div data-deliveryform></div></div>
      <div><div class="card"><div class="card-head"><h2>${t('cap.delivery')}</h2></div><div data-uploader="DELIVERY" data-types="${types.join(',')}"></div></div>
      <div class="card"><div data-evlist>${evidenceGrid(list, { area })}</div></div></div></div>`;
  }

  function obs() {
    const items = [...(det.sourceNotes ? [{ at: det.createdAt, area: 'Source request', text: det.sourceNotes }] : []), ...det.observationsList].reverse();
    return html`<div class="card"><form data-obs><label class="field"><span>${t('det.addObs')}</span><textarea class="input" name="text" maxlength="1000" placeholder="${t('det.obsPh')}"></textarea></label><div class="form-actions"><button class="btn btn-primary" type="submit">${icon('plus')}${t('det.addObs')}</button></div></form></div>
      <div class="card">${items.length ? raw(items.map((o) => `<div style="padding:12px 0;border-bottom:1px solid var(--line-2)"><div class="small muted">${esc(fmtDate(o.at))} · <strong>${esc(o.area)}</strong></div><div>${esc(o.text)}</div></div>`).join('')) : html`<div class="empty">${t('common.none')}</div>`}</div>`;
  }

  function historyTab() {
    return html`<div class="grid g2" style="align-items:start"><div class="card"><div class="card-head"><h2>${t('det.statusHistory')}</h2></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>${t('common.date')}</th><th>${t('common.status')}</th><th>${t('common.area')}</th><th>${t('common.notes')}</th></tr></thead><tbody>
      ${raw(det.history.slice().reverse().map((h) => html`<tr><td class="small">${fmtDate(h.at)}</td><td>${h.from ? raw(`${statusBadge(h.from).s} → `) : ''}${statusBadge(h.to)}</td><td>${h.area}</td><td class="small">${h.notes}${h.exception ? raw(`<div class="badge amber" style="margin-top:4px">${esc(t('det.exception'))}: ${esc(h.exception.reason)}</div>`) : ''}</td></tr>`.s).join(''))}</tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>${t('det.events')}</h2></div>${raw(det.events.slice().reverse().map((e) => `<div style="display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line-2)"><span class="small muted" style="min-width:132px">${esc(fmtDate(e.at))}</span><span style="flex:1">${esc(e.event)} — <strong>${esc(e.area)}</strong></span></div>`).join(''))}</div></div>`;
  }

  function docs() {
    return html`<div class="card"><div class="card-head"><h2>${t('det.pdf')}</h2></div><div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <label class="field" style="width:160px"><span>Format</span><select class="input" data-size><option value="LETTER">Letter</option><option value="A4">A4</option></select></label>
      <button class="btn btn-dark" data-pdf2>${icon('download')}${t('det.pdf')}</button>
      ${area === 'CESANTONI' ? html`<button class="btn btn-ghost" data-pdffin>${icon('invoice')}${t('det.pdfFin')}</button>` : ''}</div></div>
      <div class="card"><div class="card-head"><h2>${t('det.docs')}</h2></div>${det.documents.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('up.type')}</th><th>File</th><th>${t('common.date')}</th><th>${t('common.status')}</th><th></th></tr></thead><tbody>
        ${raw(det.documents.map((d) => html`<tr><td data-l="${t('up.type')}">${d.label}</td><td data-l="File" class="small mono">${d.name}</td><td data-l="${t('common.date')}">${fmtDate(d.uploadedAt)}</td><td data-l="${t('common.status')}">${t('ev.' + d.state)}</td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-file="${d.id}">${icon('eye')}${t('common.view')}</button></td></tr>`.s).join(''))}</tbody></table></div>` : html`<div class="empty">${t('common.none')}</div>`}</div>
      ${area === 'CESANTONI' ? html`<div class="card"><div class="card-head"><h2>${t('det.emails')}</h2></div>${det.emails.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>${t('common.date')}</th><th>${t('em.type')}</th><th>${t('em.to')}</th><th>${t('common.status')}</th><th>${t('em.reason')}</th></tr></thead><tbody>${raw(det.emails.map((m) => html`<tr><td class="small">${fmtDate(m.sentAt || m.createdAt)}</td><td>${m.type.replace(/_/g, ' ')}</td><td class="small">${m.to}</td><td>${mailBadge(m.status)}</td><td class="small">${m.statusReason || m.error}</td></tr>`.s).join(''))}</tbody></table></div>` : html`<div class="empty">${t('common.none')}</div>`}</div>` : ''}`;
  }

  function draw() {
    if (!ctx.isCurrent()) return;
    const body = { general, products, inventory, prep, pack: () => stagePanel('PACKAGING', ctx.meta.stages.PACKAGING), ship, delivery, obs, history: historyTab, docs }[tab]();
    el.innerHTML = html`${header()}<div style="margin-top:18px">${tabs()}</div><div data-body>${body}</div>`.s;
    bind();
  }

  function bind() {
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
    const pdf = (financial, btn) => busy(btn, () => download(`/requests/${encodeURIComponent(no)}/dossier.pdf?size=${el.querySelector('[data-size]')?.value || 'LETTER'}${financial ? '&financial=1' : ''}`, `${no}.pdf`)).catch(() => {});
    el.querySelector('[data-pdf]')?.addEventListener('click', (e) => pdf(false, e.currentTarget));
    el.querySelector('[data-pdf2]')?.addEventListener('click', (e) => pdf(false, e.currentTarget));
    el.querySelector('[data-pdffin]')?.addEventListener('click', (e) => pdf(true, e.currentTarget));
    el.querySelector('[data-mode]')?.addEventListener('change', async (e) => {
      if (!e.target.value) return;
      try { await api(`/requests/${encodeURIComponent(no)}/delivery-mode`, { method: 'POST', body: { mode: e.target.value } }); toast(t('common.saved'), 'ok'); reload(); } catch (err) { errToast(err); }
    });
    // QR of a Jr label: open the inventory tab on that product line
    if (tab === 'inventory' && ctx.query.line) {
      const card = el.querySelector(`[data-line="${CSS.escape(ctx.query.line)}"]`);
      if (card) { card.classList.add('focus-line'); setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }
    }
    el.querySelector('[data-invex]')?.addEventListener('change', async (e) => {
      try { await api(`/requests/${encodeURIComponent(no)}/inventory-exclusion`, { method: 'POST', body: { excluded: e.target.checked } }); toast(t('common.saved'), 'ok'); reload(); } catch (err) { errToast(err); }
    });
    // uploaders
    el.querySelectorAll('[data-uploader]').forEach((u) => mountUploader(u, { requestNo: no, types: u.dataset.types.split(','), meta: ctx.meta, onSaved: reload }));
    const evRoot = el.querySelector('[data-body]');
    bindEvidence(evRoot, det.evidence, { meta: ctx.meta, requestNo: no, onChange: reload });
    // quantity confirmation
    el.querySelector('[data-qtyform]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const lines = det.lines.filter((l) => f[`c${l.line}`].checked).map((l) => ({ line: l.line, qty: Number(f[`q${l.line}`].value), requested: l.pieces }));
      if (lines.length !== det.lines.length) { toast(t('det.qtyConfirm') + ': ✓ all lines', 'err'); return; }
      busy(f.querySelector('[type=submit]'), async () => { await api('/evidence', { method: 'POST', body: { requestNo: no, type: 'QUANTITY_CONFIRMATION', data: { lines }, opKey: opKey() } }); toast(t('up.saved'), 'ok'); reload(); }).catch(() => {});
    });
    // shipping & delivery
    const tf = el.querySelector('[data-trackform]'); if (tf) trackingForm(tf, { det, ctx, onSaved: reload });
    const df = el.querySelector('[data-deliveryform]'); if (df) deliveryForm(df, { det, ctx, onSaved: reload });
    el.querySelector('[data-cost]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('[type=submit]'), async () => { await api(`/requests/${encodeURIComponent(no)}/cost`, { method: 'PUT', body: { amountUsd: f.amountUsd.value, notes: f.notes.value } }); toast(t('common.saved'), 'ok'); reload(); }).catch(() => {}); });
    el.querySelector('[data-obs]')?.addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('[type=submit]'), async () => { await api(`/requests/${encodeURIComponent(no)}/observations`, { method: 'POST', body: { text: f.text.value } }); reload(); }).catch(() => {}); });
    el.querySelectorAll('button[data-file]').forEach((b) => b.addEventListener('click', () => { const d = det.documents.find((x) => x.id === b.dataset.file); viewFile(d); }));
  }

  await load();
  draw();
}
