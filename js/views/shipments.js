import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, fmtDay, statusBadge, modeLabel, modal, emptyState, options } from '../ui.js';
import { trackingForm } from './shipping-forms.js';
import { mountUploader } from '../media.js';
import { timeline } from './shared.js';

// Executive shipments desk: queue KPIs, quick queues, dense table with the next action per row.
const QUEUES = ['ALL', 'RISK', 'TO_SHIP', 'TRANSIT', 'DELIVERED', 'ISSUE', 'OTHER'];
const queueOf = (d) => {
  const s = d.shipment || {};
  if (d.status === 'DELIVERED') return 'DELIVERED';
  if (s.carrierStatus && s.carrierStatus.type === 'X') return 'ISSUE';
  if (d.deliveryMode && d.deliveryMode !== 'COURIER') return 'OTHER';
  if (!s.trackingNo) return 'TO_SHIP';
  return 'TRANSIT';
};

export async function render(el, ctx) {
  let queue = ctx.query.q0 || 'ALL';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('sh.title')}</h1><p>${t('sh.sub')}</p></div>
      <div class="actions"><a class="btn btn-ghost" href="#/labels">${icon('qr')}${t('nav.labels')}</a></div></div>
    <div class="card monitor" data-mon></div>
    <div class="kpis exec-kpis" data-k></div>
    <div class="chips" data-chips></div>
    <div class="card" style="padding:14px 16px"><form data-f><div class="toolbar">
      <input class="input" name="q" placeholder="${t('req.searchPh')}" aria-label="${t('common.search')}">
      <select class="input" name="status" style="max-width:220px" aria-label="${t('common.status')}">${options(ctx.meta.statuses.map((s) => ({ value: s, label: t('st.' + s) })), '', { all: t('common.status') + ': ' + t('common.all') })}</select>
      <label class="check nowrap"><input type="checkbox" name="active" value="1" checked><span>${t('req.activeOnly')}</span></label></div></form></div>
    <div class="card"><div class="card-head"><h2 data-count></h2></div><div data-list></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let details = [];
  let mon = null;
  const riskOf = (no) => (mon ? mon.list.find((w) => w.requestNo === no) : null);
  const ago = (h) => (h === null || h === undefined ? '—' : h < 1 ? t('mon.lessHour') : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} ${t('mon.days')}`);
  const drawMonitor = () => {
    const box = el.querySelector('[data-mon]');
    if (!mon) { box.hidden = true; return; }
    const h = mon.health;
    const cls = { OK: 'ok', DEGRADED: 'warn', DOWN: 'danger', UNKNOWN: 'info' }[h.state];
    const when = h.minutes === null ? '' : h.minutes < 1 ? t('mon.justNow') : h.minutes < 120 ? t('mon.minAgo').replace('{n}', h.minutes) : t('mon.hAgo').replace('{n}', Math.round(h.minutes / 60));
    const tr = h.tr || {};
    const src = [tr.ups ? `UPS API ${tr.apiError ? '✕' : '✓'}` : '', `Gmail UPS ${tr.gmailError ? '✕' : tr.lastRun ? '✓' : '—'}`].filter(Boolean).join(' · ');
    const risk = mon.list.filter((w) => w.risk);
    box.hidden = false;
    box.innerHTML = html`<div class="mon-head"><div class="mon-state ${cls}"><span class="pulse"></span><div><div class="strong">${t('mon.title')} · ${t('mon.st.' + h.state)}</div>
        <div class="small muted">${h.lastRun ? raw(`${esc(t('mon.lastCheck'))} ${esc(when)} · ${esc(src)} · ${esc(t('mon.every'))}`) : t('mon.unknownSub')}</div>
        ${tr.gmailError || tr.apiError ? raw(`<div class="small" style="color:var(--red)">${esc(tr.gmailError || tr.apiError)}</div>`) : ''}</div></div>
      <div class="mon-nums"><div><b>${mon.monitored}</b><span>${t('mon.auto')}</span></div><div><b>${mon.manual}</b><span>${t('mon.manual')}</span></div><div class="${mon.atRisk ? 'bad' : ''}"><b>${mon.atRisk}</b><span>${t('mon.atRisk')}</span></div>${tr.lastRun ? raw(`<div><b>${esc(tr.read ?? 0)}</b><span>${esc(t('mon.read'))}</span></div>`) : ''}</div></div>
      ${risk.length ? raw(`<div class="mon-risks">${risk.map((w) => `<a class="mon-risk sev-${w.risk.severity.toLowerCase()}" href="#/requests/${encodeURIComponent(w.requestNo)}?tab=ship"><span class="strong">${esc(w.requestNo)}</span><span>${esc(t('at.CARRIER_' + w.risk.kind))}</span><span class="muted small">${esc(w.carrier)} ${esc(w.trackingNo)}${w.last ? ' · ' + esc(w.last.description) + ' · ' + esc(ago(w.sinceScan)) : ''}</span></a>`).join('')}</div>`) : mon.list.length ? raw(`<div class="small" style="color:var(--green);margin-top:10px">${esc(t('mon.allGood'))}</div>`) : ''}`.s;
  };
  const carrierName = (s) => (s.carrier ? (s.carrier === 'OTHER' ? s.otherCarrierName : ctx.meta.carriers[s.carrier]?.name || s.carrier) : '');
  const draw = () => {
    const inQ = (d, q) => (q === 'RISK' ? Boolean(riskOf(d.requestNo)?.risk && riskOf(d.requestNo).risk.severity !== 'INFO') : queueOf(d) === q);
    const n = Object.fromEntries(QUEUES.map((q) => [q, q === 'ALL' ? details.length : details.filter((d) => inQ(d, q)).length]));
    const kpi = (k, v, cls, sub) => `<button class="kpi ${cls}" data-q="${k}" style="text-align:left;cursor:pointer"><div class="k">${esc(t('shq.' + k))}</div><div class="v">${v}</div><div class="s">${esc(sub)}</div></button>`;
    el.querySelector('[data-k]').innerHTML = kpi('TO_SHIP', n.TO_SHIP, n.TO_SHIP ? 'amber' : '', t('shq.toShipSub')) + kpi('TRANSIT', n.TRANSIT, 'accent', t('shq.transitSub')) + kpi('ISSUE', n.ISSUE, n.ISSUE ? 'red' : '', t('shq.issueSub')) + kpi('DELIVERED', n.DELIVERED, 'green', t('shq.deliveredSub'));
    el.querySelector('[data-chips]').innerHTML = QUEUES.filter((q) => q === 'ALL' || n[q] || q === queue).map((q) => `<button class="chip ${q === queue ? 'on' : ''}" data-q="${q}">${esc(t('shq.' + q))}<span>${n[q]}</span></button>`).join('');
    el.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { queue = b.dataset.q === queue && b.classList.contains('kpi') ? 'ALL' : b.dataset.q; draw(); }));
    const rows = details.filter((d) => queue === 'ALL' || inQ(d, queue));
    el.querySelector('[data-count]').textContent = `${rows.length} ${t('req.count')}`;
    const list = el.querySelector('[data-list]');
    if (!rows.length) { list.innerHTML = emptyState().s; return; }
    list.innerHTML = html`<div class="table-wrap"><table class="t cards dense"><thead><tr><th>${t('common.request')}</th><th>${t('req.destination')}</th><th>${t('common.carrier')}</th><th>${t('sh.carrierStatus')}</th><th>${t('shq.dates')}</th><th>${t('common.status')}</th><th></th></tr></thead><tbody>
      ${raw(rows.map((d) => { const s = d.shipment || {}; const q = queueOf(d); return html`<tr>
        <td data-l="${t('common.request')}" class="nowrap"><a class="strong" href="#/requests/${encodeURIComponent(d.requestNo)}?tab=ship">${d.requestNo}</a><div class="small muted">${d.company || d.customerName || ''}</div></td>
        <td data-l="${t('req.destination')}" class="small">${[d.city, d.state].filter(Boolean).join(', ') || d.country || '—'}<div class="muted">${modeLabel(d.deliveryMode)}</div></td>
        <td data-l="${t('common.carrier')}" class="small">${carrierName(s) || '—'}<div class="mono">${s.trackingNo ? (s.trackingUrl ? raw(`<a href="${esc(s.trackingUrl)}" target="_blank" rel="noopener noreferrer">${esc(s.trackingNo)}</a>`) : s.trackingNo) : raw(`<span class="muted">${esc(t('shq.noTracking'))}</span>`)}</div></td>
        <td data-l="${t('sh.carrierStatus')}" class="small">${raw(carrierStatus(s))}${(() => { const w = riskOf(d.requestNo); if (!w) return ''; return raw(`${w.last ? `<div class="muted">${esc(t('mon.lastScan'))} ${esc(ago(w.sinceScan))}</div>` : ''}${w.risk ? `<div><span class="badge ${w.risk.severity === 'CRITICAL' ? 'red' : w.risk.severity === 'WARNING' ? 'amber' : ''}">${esc(t('at.CARRIER_' + w.risk.kind))}</span></div>` : ''}${!w.auto ? `<div class="muted">${esc(t('mon.manualShort'))}</div>` : ''}`); })()}</td>
        <td data-l="${t('shq.dates')}" class="small nowrap">${s.shipDate ? raw(`<div><span class="muted">${esc(t('shq.out'))}</span> ${esc(fmtDay(s.shipDate))}</div>`) : ''}${s.deliveredAt ? raw(`<div><span class="muted">${esc(t('shq.in'))}</span> <span class="strong">${esc(fmtDate(s.deliveredAt))}</span></div>`) : s.estimatedDate ? raw(`<div><span class="muted">${esc(t('shq.eta'))}</span> ${esc(fmtDay(s.estimatedDate))} <span class="badge ${s.estimateConfirmed ? 'blue' : ''}">${s.estimateConfirmed ? 'carrier' : 'est.'}</span></div>`) : ''}${!s.shipDate && !s.deliveredAt && !s.estimatedDate ? '—' : ''}</td>
        <td data-l="${t('common.status')}">${statusBadge(d.status)}</td>
        <td class="nowrap" style="text-align:right"><button class="btn btn-ghost btn-sm" data-tl="${d.requestNo}" title="${t('det.timeline')}" aria-label="${t('det.timeline')}">${icon('log')}</button> ${q === 'TO_SHIP' || q === 'TRANSIT' || q === 'ISSUE' ? raw(`<button class="btn ${q === 'TO_SHIP' ? 'btn-primary' : 'btn-ghost'} btn-sm" data-cap="${esc(d.requestNo)}">${icon('truck').s}${esc(q === 'TO_SHIP' ? t('shq.capture') : t('shq.edit'))}</button>`) : ''}</td></tr>`.s; }).join(''))}</tbody></table></div>`.s;
    list.querySelectorAll('[data-tl]').forEach((b) => b.addEventListener('click', () => { const d = details.find((x) => x.requestNo === b.dataset.tl); modal({ title: `${t('det.timeline')} · ${d.requestNo}`, wide: true, body: timeline(d).s }); }));
    list.querySelectorAll('[data-cap]').forEach((b) => b.addEventListener('click', () => {
      const d = details.find((x) => x.requestNo === b.dataset.cap);
      const m = modal({ title: `${t('cap.label')} · ${d.requestNo}`, wide: true, body: `<div data-tf></div><h3 style="margin:18px 0 8px">${esc(t('sh.label'))} / ${esc(t('sh.dropoff'))}</h3><div data-up></div>`, onClose: load });
      trackingForm(m.body.querySelector('[data-tf]'), { det: d, ctx, onSaved: () => {} });
      mountUploader(m.body.querySelector('[data-up]'), { requestNo: d.requestNo, types: ['SHIPPING_LABEL_PHOTO', 'CARRIER_DROPOFF_PROOF'], meta: ctx.meta, onSaved: () => m.close() });
    }));
  };
  const load = async () => {
    const { requests } = await api(`/requests${qs(Object.fromEntries(new FormData(form).entries()))}`);
    const [det, m] = await Promise.all([Promise.all(requests.map((r) => api(`/requests/${encodeURIComponent(r.requestNo)}`))), api('/tracking/monitor').catch(() => null)]);
    mon = m;
    if (!ctx.isCurrent()) return;
    details = det.map((d, i) => ({ ...requests[i], ...d }));
    drawMonitor();
    draw();
  };
  let timer;
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}

// Latest status reported by the carrier (UPS, read every 30 min by the Apps Script), e.g. "26 oct 2026 [In Transit]".
export function carrierStatus(s) {
  const c = s && s.carrierStatus;
  if (!c || !c.description) return '—';
  return `${c.at ? esc(fmtDay(c.at.slice(0, 10))) + ' ' : ''}<span class="badge ${c.type === 'D' ? 'green' : c.type === 'X' ? 'red' : 'blue'}">${esc(c.description)}</span>${c.location ? `<div class="small muted">${esc(c.location)}</div>` : ''}`;
}
