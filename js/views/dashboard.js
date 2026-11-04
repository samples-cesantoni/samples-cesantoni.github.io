import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, usd, num, formData, statusBadge } from '../ui.js';
import { barChart, lineChart, chartToPng } from '../charts.js';

export async function render(el, ctx) {
  const [first, stockData, mails, reqs, mon] = await Promise.all([api('/dashboard'), api('/stock').catch(() => null), api('/emails?status=QUEUED').catch(() => ({ emails: [] })), api('/requests').catch(() => ({ requests: [] })), api('/tracking/monitor').catch(() => null)]);
  const extra = { carrierRisk: mon ? mon.atRisk : 0, trackingDown: mon && mon.health.state === 'DOWN' && mon.monitored ? 1 : 0, queued: mails.emails.length, out: stockData ? stockData.kpis.out : 0, low: stockData ? stockData.kpis.low : 0 };
  const recent = reqs.requests.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 7);
  const o = first.options;
  const sel = (name, label, list) => html`<select class="input" name="${name}" aria-label="${label}"><option value="">${label}</option>${raw(list.map((x) => (typeof x === 'object' ? `<option value="${esc(x.value)}">${esc(x.label)}</option>` : `<option>${esc(x)}</option>`)).join(''))}</select>`;
  el.innerHTML = html`<div class="page-head"><div><h1>${t('dash.title')}</h1><p>${t('dash.subExec')}</p></div>
      <div class="actions"><a class="btn btn-ghost" href="#/reports">${icon('chart')}${t('nav.reports')}</a><a class="btn btn-primary" href="#/requests">${icon('requests')}${t('nav.requests')}</a></div></div>
    <form class="filters-bar card" data-f style="padding:12px 14px;margin-bottom:18px">
      ${sel('year', t('common.year'), o.years)}
      ${sel('month', t('common.month'), Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }) })))}
      ${sel('company', t('common.customer'), o.companies)}
      ${sel('country', t('common.country'), o.countries)}
      ${sel('state', t('common.state'), o.states)}
      ${sel('carrier', t('common.carrier'), o.carriers)}
      ${sel('mode', t('common.mode'), ctx.meta.deliveryModes.map((m) => ({ value: m, label: t('mode.' + m) })))}
      ${sel('status', t('common.status'), ctx.meta.statuses.map((x) => ({ value: x, label: t('st.' + x) })))}
    </form>
    <div class="alert-strip" data-attn aria-label="${t('dash.attention')}"></div>
    <div class="exec-hero" data-hero></div>
    <div class="exec-grid">
      <div class="exec-col">
        <div class="card"><div class="card-head"><div><h2>${t('dash.pipeline')}</h2><p>${t('dash.pipelineSub')}</p></div></div><div class="pipeline" data-pipe></div></div>
        <div class="card"><div class="card-head"><h2>${t('dash.recent')}</h2><a class="small" href="#/requests">${t('dash.seeAll')}</a></div><div data-recent></div></div>
      </div>
      <div class="exec-col">
        <div class="card"><div class="card-head"><h2>${t('p.title')}</h2></div><div class="attn" data-perf></div></div>
      </div>
    </div>
    <div class="section-title">${t('dash.trends')}</div>
    <div class="grid g2" data-charts></div>`.s;
  const form = el.querySelector('[data-f]');
  const CH = [['monthly', 'ch.monthly', 'CESANTONI — Requests Received vs Delivered by Month'], ['cost', 'ch.cost', 'CESANTONI — Shipping Cost by Month (USD)'], ['status', 'ch.status', 'CESANTONI — Requests by Status'], ['carrier', 'ch.carrier', 'CESANTONI — Shipments by Carrier'], ['prep', 'ch.prep', 'CESANTONI — Average Preparation Time by Month (business hours)'], ['invoiced', 'ch.invoiced', 'CESANTONI — Invoiced vs Recorded Cost by Month (USD)']];
  el.querySelector('[data-charts]').innerHTML = CH.map(([k, l]) => `<div class="card" style="margin:0"><div class="card-head"><h2>${esc(t(l))}</h2><button class="btn btn-ghost btn-sm" data-png="${k}">${icon('download').s}PNG</button></div><div class="chart" data-c="${k}"></div></div>`).join('');
  el.querySelectorAll('[data-png]').forEach((b) => b.addEventListener('click', () => { const c = CH.find((x) => x[0] === b.dataset.png); chartToPng(el.querySelector(`[data-c="${c[0]}"]`), c[2], `${c[2].replace(/\W+/g, '_')}.png`); }));

  const draw = (d) => {
    const k = d.kpis; const p = d.performance;
    const card = (label, v, cls = '', link = '', sub = '') => `<${link ? `a href="${link}" style="text-decoration:none"` : 'div'} class="kpi ${cls}"><div class="k">${esc(t(label))}</div><div class="v">${v instanceof Object ? v.s ?? v : esc(v)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}</${link ? 'a' : 'div'}>`;
    const open = k.received + k.preparing + k.prepared;
    el.querySelector('[data-hero]').innerHTML = [
      card('k.total', k.total, 'accent', '#/requests'), card('dash.inProcess', open, '', '#/requests', `${k.received} ${t('k.received').toLowerCase()} · ${k.preparing + k.prepared} ${t('k.preparing').toLowerCase()}`),
      card('k.shipped', k.shipped, '', '#/shipments'), card('k.delivered', k.delivered, 'green', '#/requests?status=DELIVERED', p.deliveriesConfirmedPct == null ? '' : `${Math.round(p.deliveriesConfirmedPct)}% ${t('dash.confirmed')}`),
    ].join('');
    const stages = [['RECEIVED', k.received], ['PREPARING', k.preparing], ['PREPARED', k.prepared], ['SHIPPED', k.shipped], ['DELIVERED', k.delivered], ['ON_HOLD', k.onHold]];
    const max = Math.max(1, ...stages.map((x) => x[1]));
    el.querySelector('[data-pipe]').innerHTML = stages.map(([st, n]) => `<a href="#/requests?status=${st}"><div class="n">${n}</div><div class="l">${esc(t('st.' + st))}</div><div class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></div></a>`).join('');
    // Alerts first: only what needs action, most critical first; a single quiet line when all is clear.
    const alerts = [
      [extra.trackingDown, t('at.TRACKING_DOWN'), '#/shipments', 'red', 'truck'], [k.overdue, t('k.overdue'), '#/alerts', 'red', 'alert'], [extra.carrierRisk, t('dash.carrierRisk'), '#/shipments?q0=RISK', 'red', 'truck'], [k.onHold, t('k.onHold'), '#/requests?status=ON_HOLD', 'red', 'alert'], [extra.out, t('stk.kOut'), '#/inventory', 'red', 'inventory'],
      [k.pendingEvidence, t('k.pendingEvidence'), '#/validation', 'amber', 'shield'], [extra.queued, t('dash.mailQueued'), '#/emails', 'amber', 'mail'],
      [k.invoicesPending, t('k.invoicesPending'), '#/billing', 'amber', 'invoice'], [extra.low, t('stk.kLow'), '#/inventory', 'amber', 'inventory'],
    ].filter((a) => a[0] > 0);
    el.querySelector('[data-attn]').innerHTML = alerts.length
      ? alerts.map(([n, label, link, tone, ic]) => `<a class="al ${tone}" href="${link}"><span class="ic">${icon(ic).s}</span><span class="n">${esc(n)}</span><span class="t">${esc(label)}</span></a>`).join('')
      : `<div class="al ok"><span class="ic">${icon('check').s}</span><span class="t">${esc(t('dash.allClear'))}</span></div>`;
    const h = ` ${t('p.bh')}`;
    const perf = (label, v) => `<a href="#/reports" tabindex="-1"><span class="t">${esc(t(label))}</span><span class="strong">${v instanceof Object ? v.s ?? v : esc(v)}</span></a>`;
    el.querySelector('[data-perf]').innerHTML = [perf('p.avgPrep', num(p.avgPrepHours, h)), perf('p.avgShip', num(p.avgToShipHours, h)), perf('p.avgDelivery', num(p.avgToDeliveryHours, h)),
      perf('p.evidence', num(p.evidenceCompletePct, '%')), perf('p.late', num(p.outOfTargetPct, '%')), perf('k.costUsd', usd(k.costUsd)), perf('p.costReq', usd(p.avgCostPerRequestUsd))].join('');
    el.querySelector('[data-recent]').innerHTML = recent.length ? `<div class="table-wrap"><table class="t dense"><tbody>${recent.map((r) => `<tr class="click" onclick="location.hash='#/requests/${encodeURIComponent(r.requestNo)}'"><td class="strong nowrap">${esc(r.requestNo)}</td><td>${esc(r.company || r.customerName || '')}<div class="small muted">${esc([r.city, r.state, r.country].filter(Boolean).join(', '))}</div></td><td class="small muted nowrap">${esc(new Date(r.createdAt).toLocaleDateString())}</td><td style="text-align:right">${statusBadge(r.status).s ?? statusBadge(r.status)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('common.none'))}</p>`;
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
