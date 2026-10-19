import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, options, usd, num, formData } from '../ui.js';
import { barChart, lineChart, chartToPng } from '../charts.js';

export async function render(el, ctx) {
  const first = await api('/dashboard');
  const o = first.options;
  el.innerHTML = html`<div class="page-head"><div><h1>${t('dash.title')}</h1><p>${t('dash.sub')}</p></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field"><span>${t('common.year')}</span><select class="input" name="year">${options(o.years, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.month')}</span><select class="input" name="month">${options(Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }) })), '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.customer')}</span><select class="input" name="company">${options(o.companies, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.country')}</span><select class="input" name="country">${options(o.countries, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.state')}</span><select class="input" name="state">${options(o.states, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.carrier')}</span><select class="input" name="carrier">${options(o.carriers, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.mode')}</span><select class="input" name="mode">${options(ctx.meta.deliveryModes.map((m) => ({ value: m, label: t('mode.' + m) })), '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.status')}</span><select class="input" name="status">${options(ctx.meta.statuses.map((s) => ({ value: s, label: t('st.' + s) })), '', { all: t('common.all') })}</select></label>
    </form></div>
    <div class="kpis" data-kpis style="margin-top:18px"></div>
    <div class="section-title">${t('p.title')}</div><div class="kpis" data-perf></div>
    <div class="grid g2" style="margin-top:18px" data-charts></div>`.s;
  const form = el.querySelector('[data-f]');
  const CH = [['monthly', 'ch.monthly', 'CESANTONI — Requests Received vs Delivered by Month'], ['cost', 'ch.cost', 'CESANTONI — Shipping Cost by Month (USD)'], ['status', 'ch.status', 'CESANTONI — Requests by Status'], ['carrier', 'ch.carrier', 'CESANTONI — Shipments by Carrier'], ['prep', 'ch.prep', 'CESANTONI — Average Preparation Time by Month (business hours)'], ['invoiced', 'ch.invoiced', 'CESANTONI — Invoiced vs Recorded Cost by Month (USD)']];
  el.querySelector('[data-charts]').innerHTML = CH.map(([k, l]) => `<div class="card" style="margin:0"><div class="card-head"><h2>${esc(t(l))}</h2><button class="btn btn-ghost btn-sm" data-png="${k}">${icon('download').s}PNG</button></div><div class="chart" data-c="${k}"></div></div>`).join('');
  el.querySelectorAll('[data-png]').forEach((b) => b.addEventListener('click', () => { const c = CH.find((x) => x[0] === b.dataset.png); chartToPng(el.querySelector(`[data-c="${c[0]}"]`), c[2], `${c[2].replace(/\W+/g, '_')}.png`); }));

  const draw = (d) => {
    const k = d.kpis; const p = d.performance;
    const kpi = (label, v, cls = '', link = '') => `<${link ? `a href="${link}" style="text-decoration:none"` : 'div'} class="kpi ${cls}"><div class="k">${esc(t(label))}</div><div class="v">${v instanceof Object ? v.s ?? v : esc(v)}</div></${link ? 'a' : 'div'}>`;
    el.querySelector('[data-kpis]').innerHTML = [
      kpi('k.total', k.total, 'accent', '#/requests'), kpi('k.received', k.received, '', '#/requests?status=RECEIVED'), kpi('k.preparing', k.preparing, '', '#/requests?status=PREPARING'), kpi('k.prepared', k.prepared, '', '#/requests?status=PREPARED'),
      kpi('k.pendingEvidence', k.pendingEvidence, 'amber', '#/validation'), kpi('k.shipped', k.shipped, '', '#/shipments'), kpi('k.delivered', k.delivered, 'green', '#/requests?status=DELIVERED'), kpi('k.documented', k.documented, 'green'),
      kpi('k.onHold', k.onHold, k.onHold ? 'red' : '', '#/requests?status=ON_HOLD'), kpi('k.overdue', k.overdue, k.overdue ? 'red' : '', '#/alerts'), kpi('k.costUsd', usd(k.costUsd), '', '#/billing'), kpi('k.invoicesPending', k.invoicesPending, 'amber', '#/billing'), kpi('k.invoicesRecorded', k.invoicesRecorded, '', '#/billing'),
    ].join('');
    const h = ` ${t('p.bh')}`;
    el.querySelector('[data-perf]').innerHTML = [
      kpi('p.avgPrep', num(p.avgPrepHours, h)), kpi('p.avgShip', num(p.avgToShipHours, h)), kpi('p.avgDelivery', num(p.avgToDeliveryHours, h)), kpi('p.evidence', num(p.evidenceCompletePct, '%')),
      kpi('p.delivered', num(p.deliveriesConfirmedPct, '%')), kpi('p.late', num(p.outOfTargetPct, '%')), kpi('p.costReq', usd(p.avgCostPerRequestUsd)),
      `<div class="kpi"><div class="k">${esc(t('p.costCarrier'))}</div>${p.avgCostByCarrier.length ? p.avgCostByCarrier.map((c) => `<div class="small" style="margin-top:6px"><strong>${esc(c.carrier)}</strong>: USD ${c.avgUsd.toFixed(2)} <span class="muted">(${c.shipments})</span></div>`).join('') : `<div class="v"><span class="na">${esc(t('common.na'))}</span></div>`}</div>`,
    ].join('');
    const m = d.charts.monthly;
    barChart(el.querySelector('[data-c="monthly"]'), { labels: m.map((x) => x.month), series: [{ name: t('k.received'), values: m.map((x) => x.received) }, { name: t('k.delivered'), values: m.map((x) => x.delivered) }], title: t('ch.monthly') });
    lineChart(el.querySelector('[data-c="cost"]'), { labels: m.map((x) => x.month), series: [{ name: 'USD', values: m.map((x) => (x.costUsd ? x.costUsd : null)) }], fmt: (v) => Math.round(v), title: t('ch.cost') });
    barChart(el.querySelector('[data-c="status"]'), { labels: d.charts.byStatus.map((x) => t('st.' + Object.keys(ctx.meta.statusLabel).find((k) => ctx.meta.statusLabel[k] === x.label))), series: [{ name: t('common.status'), values: d.charts.byStatus.map((x) => x.value) }], title: t('ch.status') });
    barChart(el.querySelector('[data-c="carrier"]'), { labels: d.charts.byCarrier.map((x) => x.label), series: [{ name: t('common.carrier'), values: d.charts.byCarrier.map((x) => x.value) }], title: t('ch.carrier') });
    lineChart(el.querySelector('[data-c="prep"]'), { labels: m.map((x) => x.month), series: [{ name: t('p.avgPrep'), values: m.map((x) => x.avgPrepHours) }], title: t('ch.prep') });
    const inv = d.charts.invoicedByMonth;
    barChart(el.querySelector('[data-c="invoiced"]'), { labels: inv.map((x) => x.month), series: [{ name: 'Invoiced', values: inv.map((x) => x.invoicedUsd || null) }, { name: 'Recorded cost', values: inv.map((x) => x.recordedCostUsd || null) }], fmt: (v) => Math.round(v), title: t('ch.invoiced') });
  };
  form.addEventListener('change', async () => draw(await api(`/dashboard${qs(formData(form))}`)));
  draw(first);
}
