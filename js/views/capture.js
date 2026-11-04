import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, statusBadge, modal, toast, busy, modeLabel, emptyState, opKey } from '../ui.js';
import { mountUploader } from '../media.js';
import { trackingForm, deliveryForm } from './shipping-forms.js';
import { evidenceGrid, bindEvidence } from './shared.js';

// Warehouse work queue: one screen, no tabs. A searchable list of open requests with the next step of each; opening a
// request shows every step on the same page, in order, with only the step to do now expanded.
const DELIVERY_TYPES = { COURIER: ['DELIVERY_PROOF'], PICKUP: ['PICKUP_CONFIRMATION', 'COLLECTION_PROOF', 'DELIVERED_MATERIAL_PHOTO'], WAREHOUSE: ['HANDOVER_PROOF', 'DELIVERY_PROOF'] };
const STEP_KEYS = { prep: ['PREPARATION'], pack: ['PACKAGING'], ship: ['TRACKING_NUMBER', 'SHIPPING_LABEL', 'DROPOFF'], delivery: ['DELIVERY', 'PICKUP_CONFIRMATION', 'COLLECTION_PROOF', 'HANDOVER'] };
const QUEUES = ['ALL', 'prep', 'pack', 'ship', 'delivery', 'returned', 'done'];
const OK = ['APPROVED', 'COMPLETE', 'PENDING_REVIEW'];

const live = (det) => det.evidence.filter((e) => !e.supersededBy && e.state !== 'RETURNED');
// The steps of one request and which one is next.
function plan(det) {
  const courier = !det.deliveryMode || det.deliveryMode === 'COURIER';
  const ev = live(det);
  const has = (pred) => ev.some(pred);
  const items = det.checklist.items;
  const state = (k, fallback) => {
    const its = items.filter((i) => STEP_KEYS[k].includes(i.key));
    if (its.some((i) => i.state === 'RETURNED')) return 'returned';
    if (its.length) return its.every((i) => OK.includes(i.state)) ? 'done' : 'todo';
    return fallback ? 'done' : 'todo';
  };
  const steps = [
    { k: 'material', st: det.lines.every((l) => l.excludedLine || det.inventoryExcluded || (l.deductedQty || 0) >= l.pieces) ? 'done' : 'info' },
    { k: 'prep', st: state('prep', has((e) => e.stage === 'PREPARATION')) },
    { k: 'pack', st: state('pack', has((e) => e.stage === 'PACKAGING')) },
    ...(courier ? [{ k: 'ship', st: state('ship', det.trackingNo && has((e) => e.type === 'SHIPPING_LABEL_PHOTO')) }] : []),
    { k: 'delivery', st: det.status === 'DELIVERED' ? 'done' : state('delivery', has((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage))) },
  ];
  const work = steps.filter((s) => s.k !== 'material');
  const next = work.find((s) => s.st === 'returned') || work.find((s) => s.st === 'todo') || null;
  const returned = det.evidence.some((e) => e.state === 'RETURNED' && !e.supersededBy);
  return { steps, next: next ? next.k : 'done', returned, done: work.filter((s) => s.st === 'done').length, total: work.length };
}

export async function render(el, ctx) {
  let current = ctx.query.request || '';
  let queue = ctx.query.q0 || 'ALL';
  let rows = [];
  let open = null;
  let det = null;

  el.innerHTML = html`<div data-list-view>
      <div class="page-head"><div><h1>${t('wq.title')}</h1><p>${t('wq.sub')}</p></div></div>
      <div class="kpis exec-kpis wq-kpis" data-k></div>
      <div class="card" style="padding:14px 16px"><form data-search class="toolbar"><input class="input big-search" name="q" placeholder="${t('wq.searchPh')}" autocomplete="off" aria-label="${t('common.search')}"></form></div>
      <div class="chips" data-chips></div>
      <div data-list></div></div>
    <div data-work hidden></div>`.s;
  const listView = el.querySelector('[data-list-view]');
  const work = el.querySelector('[data-work]');
  const search = el.querySelector('[data-search] input');

  const loadList = async () => {
    const { requests } = await api('/requests?active=1');
    const dets = await Promise.all(requests.map((r) => api(`/requests/${encodeURIComponent(r.requestNo)}`)));
    if (!ctx.isCurrent()) return;
    rows = dets.map((d, i) => ({ ...requests[i], det: d, plan: plan(d) }))
      .sort((a, b) => Number(b.plan.returned) - Number(a.plan.returned) || Number(b.overdue) - Number(a.overdue) || String(a.createdAt).localeCompare(String(b.createdAt)));
  };
  const inQ = (r, q) => q === 'ALL' || (q === 'returned' ? r.plan.returned : r.plan.next === q);
  const matches = (r, q) => !q || [r.requestNo, r.company, r.customerName, r.city, r.state, ...r.det.lines.map((l) => `${l.model} ${l.color}`)].join(' ').toUpperCase().includes(q);

  function drawList() {
    const q = search.value.trim().toUpperCase();
    const base = rows.filter((r) => matches(r, q));
    const n = Object.fromEntries(QUEUES.map((k) => [k, base.filter((r) => inQ(r, k)).length]));
    const kpi = (k, cls) => `<button class="kpi ${cls} ${queue === k ? 'sel' : ''}" data-q="${k}" style="text-align:left;cursor:pointer"><div class="k">${esc(t('wq.q.' + k))}</div><div class="v">${n[k]}</div></button>`;
    el.querySelector('[data-k]').innerHTML = kpi('prep', n.prep ? 'amber' : '') + kpi('pack', n.pack ? 'amber' : '') + kpi('ship', n.ship ? 'accent' : '') + kpi('delivery', '') + kpi('returned', n.returned ? 'red' : 'green');
    el.querySelector('[data-chips]').innerHTML = QUEUES.filter((k) => k === 'ALL' || n[k] || k === queue).map((k) => `<button class="chip ${k === queue ? 'on' : ''}" data-q="${k}">${esc(t('wq.q.' + k))}<span>${n[k]}</span></button>`).join('');
    el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { queue = b.dataset.q === queue && b.classList.contains('kpi') ? 'ALL' : b.dataset.q; drawList(); }));
    const list = base.filter((r) => inQ(r, queue));
    const box = el.querySelector('[data-list]');
    if (!list.length) { box.innerHTML = html`<div class="card">${emptyState(rows.length ? t('common.none') : t('wq.empty'), 'check')}</div>`.s; return; }
    box.innerHTML = html`<div class="wq-list">${raw(list.map((r) => { const p = r.plan; const nx = p.returned ? 'returned' : p.next; return html`<button class="wq-row" data-open="${r.requestNo}">
      <div class="wq-main"><div class="wq-folio">${r.requestNo}${r.overdue ? raw(` <span class="dot red" title="${esc(t('k.overdue'))}"></span>`) : ''}</div>
        <div class="wq-cust">${r.company || r.customerName || '—'}</div>
        <div class="small muted">${[r.city, r.state].filter(Boolean).join(', ') || r.country || ''} · ${r.productCount} ${t('common.products').toLowerCase()} · ${r.pieces} ${t('common.pieces').toLowerCase()} · ${modeLabel(r.deliveryMode)}</div></div>
      <div class="wq-progress" aria-label="${p.done}/${p.total}">${raw(p.steps.filter((s) => s.k !== 'material').map((s) => `<i class="${s.st}" title="${esc(t('wq.s.' + s.k))}"></i>`).join(''))}<span class="small muted">${p.done}/${p.total}</span></div>
      <div class="wq-next ${nx === 'returned' ? 'danger' : nx === 'done' ? 'ok' : ''}"><span class="small muted">${t('wq.next')}</span><strong>${t('wq.do.' + nx)}</strong></div>
      <span class="btn btn-primary btn-sm wq-go">${t('wq.continue')} ${icon('chevron')}</span></button>`.s; }).join(''))}</div>`.s;
    box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openRequest(b.dataset.open)));
  }

  async function openRequest(no, keepStep) {
    current = no;
    history.replaceState(null, '', `#/capture?request=${encodeURIComponent(no)}`);
    det = await api(`/requests/${encodeURIComponent(no)}`);
    if (!ctx.isCurrent()) return;
    const p = plan(det);
    if (!keepStep) open = p.next === 'done' ? null : p.next;
    listView.hidden = true; work.hidden = false;
    drawWork();
    window.scrollTo({ top: 0 });
  }
  const back = async () => {
    current = ''; history.replaceState(null, '', '#/capture'); work.hidden = true; listView.hidden = false;
    await loadList(); drawList();
  };
  // After saving, the same step stays open (more photos may follow); when it is complete, offer the next one.
  const saved = async () => {
    det = await api(`/requests/${encodeURIComponent(current)}`);
    toast(t('common.saved'), 'ok');
    drawWork(); ctx.refreshBadges();
  };

  function stepBody(k) {
    const ev = det.evidence.filter((e) => !e.supersededBy);
    if (k === 'material') {
      return html`<div class="table-wrap"><table class="t cards dense"><thead><tr><th>#</th><th>${t('common.product')}</th><th class="num">${t('common.pieces')}</th><th>${t('common.location')}</th><th>${t('nav.inventory')}</th></tr></thead><tbody>
        ${raw(det.lines.map((l) => html`<tr><td data-l="#">${l.line}</td><td data-l="${t('common.product')}"><span class="strong">${l.model}</span>${l.color ? ` · ${l.color}` : ''}<div class="small muted">${l.pieceSize}${l.sku ? ` · SKU ${l.sku}` : ''}</div></td><td data-l="${t('common.pieces')}" class="num strong">${l.pieces}</td>
          <td data-l="${t('common.location')}"><span class="badge orange">${icon('pin')} ${l.deductions?.[0]?.location || l.location || '—'}</span></td>
          <td data-l="${t('nav.inventory')}">${l.excludedLine || det.inventoryExcluded ? raw(`<span class="badge">${esc(t('det.lineExcluded'))}</span>`) : (l.deductedQty || 0) >= l.pieces ? raw(`<span class="badge green">${esc(t('det.deductedOk'))}</span>`) : l.shortage ? raw(`<span class="badge red">${esc(t('det.shortage'))}</span>`) : raw(`<span class="badge amber">${esc(t('det.notDeducted'))}</span>`)}</td></tr>`.s).join(''))}</tbody></table></div>
        <div class="wq-actions"><a class="btn btn-ghost btn-sm" href="#/labels?request=${encodeURIComponent(det.requestNo)}">${icon('qr')}${t('nav.labels')}</a>${det.lines.some((l) => !l.excludedLine && !det.inventoryExcluded && (l.deductedQty || 0) < l.pieces) ? raw(`<a class="btn btn-ghost btn-sm" href="#/requests/${encodeURIComponent(det.requestNo)}?tab=inventory">${icon('inventory').s}${esc(t('wq.deduct'))}</a>`) : ''}</div>`;
    }
    if (k === 'prep') {
      const confirmed = ev.some((e) => e.type === 'QUANTITY_CONFIRMATION');
      return html`<div class="wq-sub"><div class="strong">${t('wq.qty')}</div>${confirmed ? raw(`<span class="badge green">${icon('check').s} ${esc(t('wq.qtyDone'))}</span>`) : ''}</div>
        <form data-qty class="qty-grid">${raw(det.lines.map((l) => `<label><span>${l.line}. ${esc([l.model, l.color].filter(Boolean).join(' · '))}</span><input class="input" type="number" min="0" name="q${l.line}" value="${l.pieces}" aria-label="${esc(t('common.qty'))}"></label>`).join(''))}
          <button class="btn btn-dark" type="submit">${icon('check')}${t('wq.qtyBtn')}</button></form>
        <div class="wq-sub" style="margin-top:16px"><div class="strong">${t('wq.photos')}</div></div>
        <div data-up="${ctx.meta.stages.PREPARATION.filter((x) => x !== 'QUANTITY_CONFIRMATION').join(',')}"></div>
        <div data-ev>${evidenceGrid(ev.filter((e) => e.stage === 'PREPARATION' && e.type !== 'QUANTITY_CONFIRMATION'), { area: 'BODEGA' })}</div>`;
    }
    if (k === 'pack') return html`<div data-up="${ctx.meta.stages.PACKAGING.join(',')}"></div><div data-ev>${evidenceGrid(ev.filter((e) => e.stage === 'PACKAGING'), { area: 'BODEGA' })}</div>`;
    if (k === 'ship') {
      return html`<div class="wq-sub"><div class="strong">${t('wq.trackTitle')}</div></div><div data-track></div>
        <div class="wq-sub" style="margin-top:16px"><div class="strong">${t('sh.label')} / ${t('sh.dropoff')}</div></div>
        <div data-up="SHIPPING_LABEL_PHOTO,CARRIER_DROPOFF_PROOF"></div><div data-ev>${evidenceGrid(ev.filter((e) => e.stage === 'SHIPPING'), { area: 'BODEGA' })}</div>`;
    }
    const types = DELIVERY_TYPES[det.deliveryMode] || [...new Set(Object.values(DELIVERY_TYPES).flat())];
    return html`${det.deliveryMode && det.deliveryMode !== 'COURIER' ? html`<div data-dform></div>` : html`<p class="small muted">${t('wq.upsAuto')}</p>`}
      <div data-up="${types.join(',')}"></div><div data-ev>${evidenceGrid(ev.filter((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage)), { area: 'BODEGA' })}</div>`;
  }

  function drawWork() {
    const p = plan(det);
    const ret = det.evidence.filter((e) => e.state === 'RETURNED' && !e.supersededBy);
    const stLabel = (s) => ({ done: t('wq.st.done'), todo: t('wq.st.todo'), returned: t('wq.st.returned'), info: t('wq.st.info') }[s.st]);
    work.innerHTML = html`<button class="btn btn-ghost btn-sm" data-back style="margin-bottom:14px">← ${t('wq.back')}</button>
      <div class="card wq-head"><div class="folio-line"><span class="folio">${det.requestNo}</span>${statusBadge(det.status)}${det.overdue ? raw(`<span class="badge red">${esc(t('det.overdueOne'))}</span>`) : ''}</div>
        <div class="wq-cust" style="margin-top:6px">${det.company || det.customerName}</div>
        <div class="small muted">${[det.city, det.state, det.country].filter(Boolean).join(', ')} · ${modeLabel(det.deliveryMode)} · ${det.lines.length} ${t('common.products').toLowerCase()} · ${det.pieces} ${t('common.pieces').toLowerCase()}</div>
        <div class="wq-bar"><i style="width:${Math.round((p.done / p.total) * 100)}%"></i></div><div class="small muted">${p.done} / ${p.total} ${t('wq.stepsDone')}${p.next === 'done' ? '' : ` · ${t('wq.next')}: ${t('wq.do.' + p.next)}`}</div>
        ${det.sourceNotes ? html`<div class="callout info" style="margin-top:12px">${icon('info')}<span>${det.sourceNotes}</span></div>` : ''}
        ${!det.deliveryMode ? html`<div class="callout warn" style="margin-top:12px">${icon('info')}<span>${t('wq.noMode')}</span></div>` : ''}</div>
      ${ret.length ? html`<div class="callout danger" style="margin:14px 0">${icon('undo')}<div>${raw(ret.map((e) => `<div style="margin:4px 0"><strong>${esc(e.typeLabel)}</strong>: ${esc(e.review?.notes || '')} <button class="btn btn-primary btn-sm" data-fix="${esc(e.id)}">${esc(t('det.uploadCorrection'))}</button></div>`).join(''))}</div></div>` : ''}
      <div class="wq-steps">${raw(p.steps.map((s, i) => `<section class="wstep ${s.st} ${open === s.k ? 'open' : ''}" data-step="${s.k}">
        <button class="wstep-h" data-toggle="${s.k}" aria-expanded="${open === s.k}"><span class="num">${s.st === 'done' ? icon('check').s : i + 1}</span><span class="tt">${esc(t('wq.s.' + s.k))}</span><span class="badge ${s.st === 'done' ? 'green' : s.st === 'returned' ? 'red' : s.st === 'todo' ? 'amber' : ''}">${esc(stLabel(s))}</span>${icon('chevron', 'chev').s}</button>
        ${open === s.k ? `<div class="wstep-b">${stepBody(s.k).s}</div>` : ''}</section>`).join(''))}</div>`.s;
    work.querySelector('[data-back]').addEventListener('click', back);
    work.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => { open = open === b.dataset.toggle ? null : b.dataset.toggle; drawWork(); work.querySelector(`[data-step="${b.dataset.toggle}"]`)?.scrollIntoView({ block: 'nearest' }); }));
    work.querySelectorAll('[data-fix]').forEach((b) => b.addEventListener('click', () => {
      const e = det.evidence.find((x) => x.id === b.dataset.fix);
      const m = modal({ title: t('det.uploadCorrection'), body: '<div data-up></div>' });
      mountUploader(m.body.querySelector('[data-up]'), { requestNo: det.requestNo, types: [e.type], meta: ctx.meta, replaces: e.id, compact: true, onSaved: () => { m.close(); saved(); } });
    }));
    const body = work.querySelector('.wstep.open .wstep-b');
    if (!body) return;
    const cur = p.steps.find((x) => x.k === open);
    if (cur && cur.st === 'done' && open !== 'material') {
      const note = document.createElement('div'); note.className = 'next ok'; note.style.margin = '0 0 14px';
      note.innerHTML = `${icon('check').s}<span>${esc(t('wq.stepDone'))}${p.next === 'done' ? ' · ' + esc(t('wq.allDone')) : ''}</span>${p.next !== 'done' ? `<button class="btn btn-primary btn-sm" data-gonext>${esc(t('wq.goNext'))}: ${esc(t('wq.s.' + p.next))}</button>` : ''}`;
      body.prepend(note);
      note.querySelector('[data-gonext]')?.addEventListener('click', () => { open = p.next; drawWork(); work.querySelector('.wstep.open')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    }
    body.querySelectorAll('[data-up]').forEach((u) => mountUploader(u, { requestNo: det.requestNo, types: u.dataset.up.split(','), meta: ctx.meta, compact: true, onSaved: saved }));
    bindEvidence(body, det.evidence, { meta: ctx.meta, requestNo: det.requestNo, onChange: saved });
    const tr = body.querySelector('[data-track]'); if (tr) trackingForm(tr, { det, ctx, onSaved: saved });
    const df = body.querySelector('[data-dform]'); if (df) deliveryForm(df, { det, ctx, onSaved: saved });
    body.querySelector('[data-qty]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const lines = det.lines.map((l) => ({ line: l.line, qty: Number(f[`q${l.line}`].value), requested: l.pieces }));
      busy(f.querySelector('[type=submit]'), async () => { await api('/evidence', { method: 'POST', body: { requestNo: det.requestNo, type: 'QUANTITY_CONFIRMATION', data: { lines }, opKey: opKey() } }); await saved(); }).catch(() => {});
    });
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(drawList, 120); });
  el.querySelector('[data-search]').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = search.value.trim().toUpperCase();
    const hit = rows.find((r) => r.requestNo === q) || (rows.filter((r) => matches(r, q)).length === 1 ? rows.find((r) => matches(r, q)) : null);
    if (hit) openRequest(hit.requestNo);
  });
  await loadList();
  if (current) await openRequest(current); else drawList();
}
