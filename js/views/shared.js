import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, evBadge, clBadge, viewFile, modal, toast, errToast, busy } from '../ui.js';
import { mountUploader } from '../media.js';

const FLOWS = {
  COURIER: ['RECEIVED', 'PREPARING', 'PREPARED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  PICKUP: ['RECEIVED', 'PREPARING', 'PREPARED', 'READY_FOR_PICKUP', 'DELIVERED'],
  WAREHOUSE: ['RECEIVED', 'PREPARING', 'PREPARED', 'DELIVERED'],
};
export function timeline(det) {
  const flow = FLOWS[det.deliveryMode] || FLOWS.COURIER;
  const cur = ['ON_HOLD', 'CANCELLED'].includes(det.status) ? null : det.status;
  const idx = flow.indexOf(cur);
  const delivered = det.shipment?.deliveredAt;
  const steps = flow.map((s, i) => {
    const cls = idx > i || (idx === i && s === 'DELIVERED') ? 'done' : idx === i ? 'current' : '';
    const when = det.statusDates?.[s] ? fmtDate(det.statusDates[s]) : (s === 'DELIVERED' && delivered ? fmtDate(delivered) : '');
    return `<div class="step ${cls}"><div class="dot">${cls === 'done' ? icon('check').s : ''}</div><div class="name">${esc(t('st.' + s))}</div><div class="when">${esc(when)}</div></div>`;
  }).join('');
  const extra = cur ? '' : `<div class="callout ${det.status === 'ON_HOLD' ? 'warn' : 'danger'}" style="margin-top:12px">${icon('alert').s}<span>${esc(t('st.' + det.status))}</span></div>`;
  return raw(`<div class="timeline" role="list">${steps}</div>${extra}`);
}

export function checklistBlock(cl) {
  return html`<div class="card-head"><div><h2>${t('det.checklist')}</h2><p>${cl.mode ? t('mode.' + cl.mode) : t('det.setMode')}</p></div>
    <div class="progress" style="min-width:180px"><span class="light ${cl.light}"></span><div class="bar"><i class="${cl.light}" style="width:${cl.pct}%"></i></div><span class="strong">${cl.pct}%</span></div></div>
    <div class="checklist">${raw(cl.items.map((i) => `<div class="item"><span class="light ${i.state === 'APPROVED' || i.state === 'COMPLETE' ? 'GREEN' : i.due && ['MISSING', 'RETURNED'].includes(i.state) && i.critical ? 'RED' : 'AMBER'}"></span><span class="lbl">${esc(i.label)}${i.critical ? ' <span class="small muted">· critical</span>' : ''}</span>${clBadge(i.state).s}</div>`).join(''))}</div>`;
}

export function evidenceGrid(list, { area, onChange, meta }) {
  if (!list.length) return html`<div class="empty small">${icon('capture')}${t('det.noEvidence')}</div>`;
  return html`<div class="ev-grid">${raw(list.map((e) => {
    const f = e.file;
    const thumb = f ? (/^image\//.test(f.mime) ? `<img loading="lazy" data-file="${esc(f.id)}" alt="${esc(e.typeLabel)}">` : `<span class="pdf">${icon('file').s}PDF</span>`)
      : `<span class="pdf" style="color:var(--green)">${icon('check').s}${esc((e.data?.lines || []).map((l) => `L${l.line}: ${l.qty}`).join(' · '))}</span>`;
    return `<div class="ev ${e.supersededBy ? 'superseded' : ''}" data-ev="${esc(e.id)}">
      <button class="thumb" type="button" data-view="${esc(e.id)}" aria-label="${esc(t('common.view'))}" ${f ? '' : 'disabled'}>${thumb}</button>
      <div class="body"><div class="t">${esc(e.typeLabel)}</div><div class="m">${esc(fmtDate(e.uploadedAt))} · ${esc(e.area === 'BODEGA' ? 'Warehouse' : e.area)}</div>
      <div>${evBadge(e.state).s}</div>${e.notes ? `<div class="m">${esc(e.notes)}</div>` : ''}
      ${e.supersededBy ? `<div class="m">${esc(t('det.superseded'))}</div>` : ''}
      ${e.state === 'RETURNED' && e.review ? `<div class="note-box"><strong>${esc(t('det.returnedNote'))}:</strong> ${esc(e.review.notes)}</div>` : ''}
      ${e.state === 'APPROVED' && e.review?.notes ? `<div class="m">✓ ${esc(e.review.notes)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:6px">
        ${e.state === 'RETURNED' && !e.supersededBy ? `<button class="btn btn-primary btn-sm" data-correct="${esc(e.id)}">${icon('upload').s}${esc(t('det.uploadCorrection'))}</button>` : ''}
        ${area === 'CESANTONI' && e.state === 'PENDING' && !e.supersededBy ? `<button class="btn btn-success btn-sm" data-approve="${esc(e.id)}">${icon('check').s}${esc(t('val.approve'))}</button><button class="btn btn-danger btn-sm" data-return="${esc(e.id)}">${icon('undo').s}${esc(t('val.return'))}</button>` : ''}
      </div></div></div>`;
  }).join(''))}</div>`;
}

// Wire up evidence-card actions inside `root`.
export function bindEvidence(root, list, { meta, requestNo, onChange }) {
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { const e = list.find((x) => x.id === b.dataset.view); if (e?.file) viewFile(e.file); }));
  root.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => reviewDialog(list.find((x) => x.id === b.dataset.approve), 'APPROVE', onChange)));
  root.querySelectorAll('[data-return]').forEach((b) => b.addEventListener('click', () => reviewDialog(list.find((x) => x.id === b.dataset.return), 'RETURN', onChange)));
  root.querySelectorAll('[data-correct]').forEach((b) => b.addEventListener('click', () => {
    const e = list.find((x) => x.id === b.dataset.correct);
    const m = modal({ title: `${t('det.uploadCorrection')} · ${e.typeLabel}`, body: `<div class="note-box" style="margin-bottom:12px"><strong>${esc(t('det.returnedNote'))}:</strong> ${esc(e.review?.notes || '')}</div><div data-up></div>`, wide: true });
    mountUploader(m.body.querySelector('[data-up]'), { requestNo, types: [e.type], meta, replaces: e.id, onSaved: () => { m.close(); onChange(); } });
  }));
}

export function reviewDialog(e, decision, onChange) {
  const isReturn = decision === 'RETURN';
  const preview = e.file ? (/^image\//.test(e.file.mime) ? `<img data-file="${esc(e.file.id)}" alt="" style="max-height:300px;display:block;margin:0 auto 14px;border-radius:8px">` : `<p class="small">PDF: ${esc(e.file.name)}</p>`) : '';
  const m = modal({
    title: `${isReturn ? t('val.return') : t('val.approve')} · ${e.requestNo}`,
    body: `${preview}<p class="strong" style="margin:0 0 10px">${esc(e.typeLabel)}</p><label class="field"><span>${esc(t('val.obs'))}</span><textarea class="input" name="notes" maxlength="1000" ${isReturn ? 'required' : ''}></textarea></label>${isReturn ? `<p class="hint">${esc(t('val.obsReq'))}</p>` : ''}`,
    foot: `<button class="btn btn-ghost" data-close>${esc(t('common.cancel'))}</button><button class="btn ${isReturn ? 'btn-danger' : 'btn-success'}" data-go>${esc(isReturn ? t('val.return') : t('val.approve'))}</button>`,
  });
  const btn = m.el.querySelector('[data-go]');
  btn.addEventListener('click', () => busy(btn, async () => {
    const notes = m.el.querySelector('[name=notes]').value.trim();
    if (isReturn && notes.length < 5) { m.el.querySelector('[name=notes]').classList.add('invalid'); toast(t('val.obsReq'), 'err'); return; }
    await api(`/evidence/${encodeURIComponent(e.id)}/review`, { method: 'POST', body: { decision, notes } });
    toast(t('common.saved'), 'ok'); m.close(); onChange?.();
  }).catch(() => {}));
}

// Search-as-you-type request selector.
export async function requestPicker(el, { value, onPick, activeOnly = false, placeholder }) {
  const { requests } = await api(`/requests${activeOnly ? '?active=1' : ''}`);
  el.innerHTML = html`<label class="field"><span>${t('common.request')}</span><input class="input" list="rq-list-${el.id || 'x'}" value="${value || ''}" placeholder="${placeholder || 'SMCES-0001'}" autocomplete="off"></label>
    <datalist id="rq-list-${el.id || 'x'}">${raw(requests.map((r) => `<option value="${esc(r.requestNo)}">${esc(r.requestNo)} · ${esc(r.company || r.customerName)} · ${esc(t('st.' + r.status))}</option>`).join(''))}</datalist>`.s;
  const input = el.querySelector('input');
  const fire = () => { const v = input.value.trim().toUpperCase(); const hit = requests.find((r) => r.requestNo === v); if (hit) onPick(hit.requestNo); };
  input.addEventListener('change', fire);
  input.addEventListener('input', () => { if (requests.some((r) => r.requestNo === input.value.trim().toUpperCase())) fire(); });
  return requests;
}
