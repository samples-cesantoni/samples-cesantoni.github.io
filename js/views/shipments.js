import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, fmtDay, statusBadge, modeLabel, modal, emptyState, options } from '../ui.js';
import { trackingForm } from './shipping-forms.js';
import { mountUploader } from '../media.js';
import { timeline } from './shared.js';

export async function render(el, ctx) {
  el.innerHTML = html`<div class="page-head"><div><h1>${t('sh.title')}</h1><p>${t('sh.sub')}</p></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field search"><span>${t('common.search')}</span><input class="input" name="q" placeholder="${t('req.searchPh')}"></label>
      <label class="field"><span>${t('common.status')}</span><select class="input" name="status">${options(ctx.meta.statuses.map((s) => ({ value: s, label: t('st.' + s) })), '', { all: t('common.all') })}</select></label>
      <label class="check" style="align-self:center"><input type="checkbox" name="active" value="1" checked><span>${t('req.activeOnly')}</span></label>
    </form></div><div class="card" data-list></div>`.s;
  const form = el.querySelector('[data-f]');
  const load = async () => {
    const { requests } = await api(`/requests${qs(Object.fromEntries(new FormData(form).entries()))}`);
    const list = el.querySelector('[data-list]');
    if (!requests.length) { list.innerHTML = emptyState().s; return; }
    const details = await Promise.all(requests.map((r) => api(`/requests/${encodeURIComponent(r.requestNo)}`)));
    list.innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.request')}</th><th>${t('common.mode')}</th><th>${t('common.carrier')}</th><th>${t('sh.tracking')}</th><th>${t('sh.shipDate')}</th><th>${t('sh.estimated')}</th><th>${t('sh.deliveredAt')}</th><th>${t('common.status')}</th><th></th></tr></thead><tbody>
      ${raw(details.map((d) => { const s = d.shipment || {}; return html`<tr>
        <td data-l="${t('common.request')}"><a class="strong" href="#/requests/${encodeURIComponent(d.requestNo)}?tab=ship">${d.requestNo}</a><div class="small muted">${d.company}</div></td>
        <td data-l="${t('common.mode')}">${modeLabel(d.deliveryMode)}</td>
        <td data-l="${t('common.carrier')}">${s.carrier ? (s.carrier === 'OTHER' ? s.otherCarrierName : ctx.meta.carriers[s.carrier]?.name) : '—'}</td>
        <td data-l="${t('sh.tracking')}" class="mono">${s.trackingNo ? (s.trackingUrl ? raw(`<a href="${esc(s.trackingUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.trackingNo)}</a>`) : s.trackingNo) : '—'}</td>
        <td data-l="${t('sh.shipDate')}">${s.shipDate ? fmtDay(s.shipDate) : '—'}</td>
        <td data-l="${t('sh.estimated')}">${s.estimatedDate ? raw(`${esc(fmtDay(s.estimatedDate))} <span class="badge ${s.estimateConfirmed ? 'blue' : ''}">${s.estimateConfirmed ? 'carrier' : 'estimate'}</span>`) : '—'}</td>
        <td data-l="${t('sh.deliveredAt')}">${s.deliveredAt ? fmtDate(s.deliveredAt) : '—'}</td>
        <td data-l="${t('common.status')}">${statusBadge(d.status)}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-tl="${d.requestNo}">${t('det.timeline')}</button> <button class="btn btn-primary btn-sm" data-cap="${d.requestNo}">${icon('truck')}${t('cap.label')}</button></td></tr>`.s; }).join(''))}</tbody></table></div>`.s;
    list.querySelectorAll('[data-tl]').forEach((b) => b.addEventListener('click', () => { const d = details.find((x) => x.requestNo === b.dataset.tl); modal({ title: `${t('det.timeline')} · ${d.requestNo}`, wide: true, body: timeline(d).s }); }));
    list.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => {
      const d = details.find((x) => x.requestNo === b.dataset.cap);
      const m = modal({ title: `${t('cap.label')} · ${d.requestNo}`, wide: true, body: `<div data-tf></div><h3 style="margin:18px 0 8px">${esc(t('sh.label'))} / ${esc(t('sh.dropoff'))}</h3><div data-up></div>`, onClose: load });
      trackingForm(m.body.querySelector('[data-tf]'), { det: d, ctx, onSaved: () => {} });
      mountUploader(m.body.querySelector('[data-up]'), { requestNo: d.requestNo, types: ['SHIPPING_LABEL_PHOTO', 'CARRIER_DROPOFF_PROOF'], meta: ctx.meta, onSaved: () => m.close() });
    }));
  };
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}
