import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, options, toast, busy } from '../ui.js';
import { normalizeFile, ocrTracking } from '../media.js';
import { carrierStatus } from './shipments.js';

export function trackingForm(el, { det, ctx, onSaved }) {
  const s = det.shipment || {};
  const area = ctx.session.area;
  const carriers = Object.entries(ctx.meta.carriers).map(([k, v]) => ({ value: k, label: v.name }));
  el.innerHTML = html`<form class="form-grid" data-tform novalidate>
    <label class="field"><span>${t('common.carrier')}</span><select class="input" name="carrier">${options(carriers, s.carrier, { all: t('common.select') })}</select></label>
    <label class="field" data-other ${s.carrier === 'OTHER' ? '' : 'hidden'}><span>${t('sh.other')}</span><input class="input" name="otherCarrierName" value="${s.otherCarrierName || ''}"></label>
    <label class="field"><span>${t('sh.tracking')}</span><input class="input mono" name="trackingNo" value="${s.trackingNo || ''}" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
    <label class="field"><span>${t('sh.shipDate')}</span><input class="input" type="date" name="shipDate" value="${s.shipDate || ''}"></label>
    <label class="field"><span>${t('sh.method')}</span><input class="input" name="deliveryMethod" value="${s.deliveryMethod || ''}" placeholder="Ground / Express…"></label>
    ${area === 'CESANTONI' ? html`<label class="field"><span>${t('sh.estimated')}</span><input class="input" type="date" name="estimatedDate" value="${s.estimatedDate || ''}"></label><label class="check" style="align-self:end"><input type="checkbox" name="estimateConfirmed" ${s.estimateConfirmed ? 'checked' : ''}><span>${t('sh.estimateConfirmed')}</span></label>` : ''}
    <label class="field" style="grid-column:1/-1"><span>${t('common.notes')}</span><input class="input" name="notes" value="${s.notes || ''}"></label>
    <div style="grid-column:1/-1"><label class="btn btn-ghost">${icon('scan')}${t('sh.ocr')}<input type="file" accept="image/*" capture="environment" hidden data-ocr></label><div data-ocrout class="small" style="margin-top:8px"></div></div>
    <label class="check" style="grid-column:1/-1" data-confirm hidden><input type="checkbox" name="trackingConfirmed"><span>${t('sh.confirm')}</span></label>
    <div style="grid-column:1/-1;display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap;align-items:center">
      <span class="small">${s.trackingUrl ? html`<a href="${s.trackingUrl}" target="_blank" rel="noopener noreferrer">${icon('link')} ${t('sh.track')}</a>` : s.trackingNo ? t('sh.noUrl') : ''}${s.carrierStatus ? html`<span style="margin-left:10px">${t('sh.carrierStatus')}: ${raw(carrierStatus(s))}</span>` : ''}</span>
      <button class="btn btn-primary" type="submit">${icon('check')}${t('sh.saveShip')}</button></div>
  </form>`.s;
  const f = el.querySelector('form');
  f.carrier.addEventListener('change', () => { el.querySelector('[data-other]').hidden = f.carrier.value !== 'OTHER'; });
  // A number typed by hand counts as verified; only a number picked from the OCR asks for the check.
  let fromOcr = false;
  const confirmBox = el.querySelector('[data-confirm]');
  f.trackingNo.addEventListener('input', () => { fromOcr = false; confirmBox.hidden = true; });
  el.querySelector('[data-ocr]').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    const out = el.querySelector('[data-ocrout]');
    out.textContent = t('sh.ocrRun');
    try {
      const n = await normalizeFile(file);
      const { candidates } = await ocrTracking(n.canvas || file);
      if (!candidates.length) { out.textContent = t('sh.ocrNone'); return; }
      out.innerHTML = `${esc(t('sh.ocrPick'))}<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${candidates.map((c) => `<button type="button" class="btn btn-ghost btn-sm mono" data-cand="${esc(c)}">${esc(c)}</button>`).join('')}</div>`;
      out.querySelectorAll('[data-cand]').forEach((b) => b.addEventListener('click', () => { f.trackingNo.value = b.dataset.cand; fromOcr = true; confirmBox.hidden = false; f.trackingConfirmed.checked = false; }));
    } catch (err) { out.textContent = `${t('sh.ocrNone')} (${err.message})`; }
  });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const body = { carrier: f.carrier.value, otherCarrierName: f.otherCarrierName.value, trackingNo: f.trackingNo.value.trim(), shipDate: f.shipDate.value, deliveryMethod: f.deliveryMethod.value, notes: f.notes.value, trackingConfirmed: !fromOcr || f.trackingConfirmed.checked };
    if (area === 'CESANTONI') { body.estimatedDate = f.estimatedDate.value; body.estimateConfirmed = f.estimateConfirmed.checked; }
    if (body.trackingNo && body.trackingNo.toUpperCase() !== (s.trackingNo || '') && !body.trackingConfirmed) { toast(t('sh.confirmNeeded'), 'err'); f.trackingConfirmed.focus(); return; }
    if (body.trackingNo.toUpperCase() === (s.trackingNo || '')) body.trackingConfirmed = true; // unchanged, already verified
    busy(f.querySelector('[type=submit]'), async () => { await api(`/requests/${encodeURIComponent(det.requestNo)}/shipment`, { method: 'PUT', body }); toast(t('common.saved'), 'ok'); onSaved?.(); }).catch(() => {});
  });
}

export function deliveryForm(el, { det, onSaved }) {
  const s = det.shipment || {};
  el.innerHTML = html`<form class="form-grid">
    <label class="field"><span>${t('sh.deliveredAt')}</span><input class="input" type="datetime-local" name="deliveredAt" value="${toLocalInput(s.deliveredAt)}"></label>
    <label class="field"><span>${t('sh.result')}</span><select class="input" name="deliveryResult">${options(['DELIVERED_OK', 'DELIVERED_WITH_ISSUES', 'NOT_DELIVERED'].map((x) => ({ value: x, label: t('res.' + x) })), s.deliveryResult, { all: t('common.select') })}</select></label>
    <label class="field" style="grid-column:1/-1"><span>${t('common.notes')}</span><input class="input" name="deliveryNotes" value="${s.deliveryNotes || ''}"></label>
    <div class="form-actions" style="grid-column:1/-1;margin-top:0"><button class="btn btn-primary" type="submit">${icon('check')}${t('sh.saveDelivery')}</button></div></form>`.s;
  const f = el.querySelector('form');
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!f.deliveredAt.value || !f.deliveryResult.value) { toast(`${t('sh.deliveredAt')} / ${t('sh.result')}`, 'err'); return; }
    busy(f.querySelector('[type=submit]'), async () => { await api(`/requests/${encodeURIComponent(det.requestNo)}/shipment`, { method: 'PUT', body: { deliveredAt: new Date(f.deliveredAt.value).toISOString(), deliveryResult: f.deliveryResult.value, deliveryNotes: f.deliveryNotes.value } }); toast(t('common.saved'), 'ok'); onSaved?.(); }).catch(() => {});
  });
}

function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso); if (isNaN(d)) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
