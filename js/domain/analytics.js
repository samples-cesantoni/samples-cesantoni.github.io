// Dashboard + the 15 reports. Every figure is derived from stored records; when a value
// cannot be computed it is returned as null ("not available"), never estimated.
import { checklist } from './checklist.js';
import { timeCtx, requestTimes, overdue } from './metrics.js';
import { computeAlerts } from './alerts.js';
import { financeSummary, isShipment, shipmentPeriod } from './finance.js';
import { monthKey, localParts } from './time.js';
import { STATUS_LABEL, DELIVERY_MODE_LABEL, NOTICE_LABEL, EVIDENCE_LABEL, CARRIERS } from './catalog.js';
import { norm } from './sheet-parse.js';

const avg = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const carrierName = (ctx, c) => (ctx.settings().carriers[c]?.name || c || 'Not captured');

function filtered(ctx, f = {}) {
  const d = ctx.store.data;
  const tz = ctx.config.timeZone;
  return Object.values(d.requests).filter((r) => {
    const p = r.createdAt ? localParts(new Date(r.createdAt), tz) : null;
    const s = d.shipments[r.requestNo] || {};
    if (f.year && (!p || String(p.y) !== String(f.year))) return false;
    if (f.month && (!p || p.m !== Number(f.month))) return false;
    if (f.from && r.createdAt && localParts(new Date(r.createdAt), tz).iso < f.from) return false;
    if (f.to && r.createdAt && localParts(new Date(r.createdAt), tz).iso > f.to) return false;
    if (f.company && norm(r.customer.company) !== norm(f.company)) return false;
    if (f.country && r.country !== f.country) return false;
    if (f.state && r.state !== f.state) return false;
    if (f.carrier && s.carrier !== f.carrier) return false;
    if (f.mode && r.deliveryMode !== f.mode) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

function dashboard(ctx, f) {
  const d = ctx.store.data;
  const tz = ctx.config.timeZone;
  const tc = timeCtx(ctx);
  const settings = ctx.settings();
  const reqs = filtered(ctx, f);
  const rows = reqs.map((r) => ({ r, cl: checklist(d, r), t: requestTimes(ctx, r, tc) }));
  const by = (st) => reqs.filter((r) => st.includes(r.status)).length;
  const costs = reqs.map((r) => d.shippingCosts[r.requestNo]?.amountUsd).filter((x) => x !== null && x !== undefined);
  const fin = financeSummary(d, tz, { year: f.year, month: f.month, carrier: f.carrier });
  const delivered = rows.filter((x) => x.r.status === 'DELIVERED');
  const overdueNow = rows.filter((x) => overdue(ctx, x.r, x.t, settings));
  const lateEver = rows.filter((x) => x.t.prepHours !== null && x.t.prepHours > settings.targets.RECEIVED_TO_PREPARED);
  const byCarrier = {};
  for (const r of reqs) {
    const c = d.shipments[r.requestNo]?.carrier; const cost = d.shippingCosts[r.requestNo]?.amountUsd;
    if (!c || cost === null || cost === undefined) continue;
    (byCarrier[c] = byCarrier[c] || []).push(cost);
  }
  const months = {};
  for (const x of rows) {
    if (!x.r.createdAt) continue;
    const m = monthKey(x.r.createdAt, tz);
    months[m] = months[m] || { month: m, received: 0, delivered: 0, costUsd: 0, prep: [] };
    months[m].received += 1;
    if (x.r.status === 'DELIVERED') months[m].delivered += 1;
    const c = d.shippingCosts[x.r.requestNo]?.amountUsd; if (c) months[m].costUsd = Math.round((months[m].costUsd + c) * 100) / 100;
    months[m].prep.push(x.t.prepHours);
  }
  return {
    filters: f,
    kpis: {
      total: reqs.length, received: by(['RECEIVED']), preparing: by(['PREPARING']), prepared: by(['PREPARED', 'READY_FOR_PICKUP']),
      pendingEvidence: rows.filter((x) => x.cl.items.some((i) => i.due && i.state !== 'APPROVED' && i.state !== 'COMPLETE')).length,
      shipped: by(['SHIPPED', 'IN_TRANSIT']), delivered: by(['DELIVERED']), documented: rows.filter((x) => x.cl.documented).length,
      onHold: by(['ON_HOLD']), overdue: overdueNow.length,
      costUsd: costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      invoicesPending: fin.kpis.pendingInvoices, invoicesRecorded: fin.invoices.length,
    },
    performance: {
      avgPrepHours: avg(rows.map((x) => x.t.prepHours)), avgToShipHours: avg(rows.map((x) => x.t.toShipHours)), avgToDeliveryHours: avg(rows.map((x) => x.t.toDeliveryHours)),
      evidenceCompletePct: pct(rows.filter((x) => x.cl.documented).length, rows.length),
      deliveriesConfirmedPct: pct(delivered.filter((x) => x.cl.items.some((i) => ['DELIVERY', 'COLLECTION_PROOF', 'HANDOVER'].includes(i.key) && ['APPROVED', 'PENDING_REVIEW'].includes(i.state))).length, delivered.length),
      outOfTargetPct: pct(new Set([...overdueNow, ...lateEver].map((x) => x.r.requestNo)).size, rows.length),
      avgCostPerRequestUsd: costs.length ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 100) / 100 : null,
      avgCostByCarrier: Object.entries(byCarrier).map(([c, v]) => ({ carrier: carrierName(ctx, c), avgUsd: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100, shipments: v.length })),
    },
    charts: {
      monthly: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ month: m.month, received: m.received, delivered: m.delivered, costUsd: m.costUsd, avgPrepHours: avg(m.prep) })),
      byStatus: Object.keys(STATUS_LABEL).map((s) => ({ label: STATUS_LABEL[s], value: by([s]) })).filter((x) => x.value),
      byCarrier: Object.entries(reqs.reduce((a, r) => { const c = d.shipments[r.requestNo]?.carrier; if (c) a[c] = (a[c] || 0) + 1; return a; }, {})).map(([c, v]) => ({ label: carrierName(ctx, c), value: v })),
      invoicedByMonth: fin.months,
    },
    options: filterOptions(ctx),
  };
}

function filterOptions(ctx) {
  const d = ctx.store.data; const reqs = Object.values(d.requests);
  const uniq = (a) => [...new Set(a.filter(Boolean))].sort();
  return {
    years: uniq(reqs.map((r) => r.createdAt && String(localParts(new Date(r.createdAt), ctx.config.timeZone).y))),
    companies: uniq(reqs.map((r) => r.customer.company)), countries: uniq(reqs.map((r) => r.country)), states: uniq(reqs.map((r) => r.state)),
    carriers: Object.entries(ctx.settings().carriers).map(([k, v]) => ({ value: k, label: v.name })),
  };
}

// ---------- Reports (all headers in English) ----------
const REPORTS = [
  ['requests-by-month', 'Requests Received by Month'], ['prepared-samples', 'Prepared Samples'], ['shipments-by-carrier', 'Shipments by Carrier'],
  ['confirmed-deliveries', 'Confirmed Deliveries'], ['evidence-completeness', 'Complete and Incomplete Evidence'], ['avg-preparation-time', 'Average Preparation Time'],
  ['avg-shipping-time', 'Average Shipping Time'], ['incidents-delays', 'Incidents and Delays'], ['top-customers', 'Customers with Most Requests'],
  ['top-products', 'Most Requested Products'], ['inventory-consumption', 'Inventory Consumption'], ['logistics-costs', 'Logistics Costs (USD)'],
  ['monthly-billing', 'Monthly Billing (USD)'], ['held-by-notices', 'Requests Held by Holidays and Notices'], ['logistics-efficiency', 'Logistics Efficiency by Period'],
];
const col = (key, label, type) => ({ key, label, type });

function report(ctx, id, f = {}) {
  const d = ctx.store.data; const tz = ctx.config.timeZone; const tc = timeCtx(ctx); const settings = ctx.settings();
  const reqs = filtered(ctx, f);
  const fmtDate = (iso) => (iso ? localParts(new Date(iso), tz).iso : '');
  const def = REPORTS.find((r) => r[0] === id);
  if (!def) return null;
  let columns = []; let rows = []; let chart = null;
  const groupMonth = (fn) => { const m = {}; for (const r of reqs) if (r.createdAt) { const k = monthKey(r.createdAt, tz); (m[k] = m[k] || []).push(r); } return Object.keys(m).sort().map((k) => fn(k, m[k])); };
  switch (id) {
    case 'requests-by-month':
      columns = [col('month', 'Month'), col('requests', 'Requests Received', 'n'), col('lines', 'Sample Lines', 'n'), col('pieces', 'Pieces Requested', 'n')];
      rows = groupMonth((m, a) => ({ month: m, requests: a.length, lines: a.reduce((s, r) => s + r.lines.length, 0), pieces: a.reduce((s, r) => s + r.lines.reduce((x, l) => x + (l.pieces || 0), 0), 0) }));
      chart = { type: 'bar', label: 'month', value: 'requests' }; break;
    case 'prepared-samples':
      columns = [col('requestNo', 'Request No.'), col('company', 'Company'), col('requestDate', 'Request Date'), col('preparedDate', 'Prepared Date'), col('prepHours', 'Preparation Time (business h)', 'n'), col('lines', 'Lines', 'n'), col('pieces', 'Pieces', 'n')];
      rows = reqs.filter((r) => r.statusDates?.PREPARED).map((r) => ({ requestNo: r.requestNo, company: r.customer.company, requestDate: fmtDate(r.createdAt), preparedDate: fmtDate(r.statusDates.PREPARED), prepHours: requestTimes(ctx, r, tc).prepHours, lines: r.lines.length, pieces: r.lines.reduce((s, l) => s + (l.pieces || 0), 0) }));
      break;
    case 'shipments-by-carrier': {
      columns = [col('carrier', 'Carrier'), col('shipments', 'Shipments', 'n'), col('inTransit', 'Shipped / In Transit', 'n'), col('delivered', 'Delivered', 'n')];
      const m = {};
      for (const r of reqs.filter((x) => isShipment(d, x))) { const c = carrierName(ctx, d.shipments[r.requestNo]?.carrier); m[c] = m[c] || { carrier: c, shipments: 0, inTransit: 0, delivered: 0 }; m[c].shipments += 1; if (['SHIPPED', 'IN_TRANSIT'].includes(r.status)) m[c].inTransit += 1; if (r.status === 'DELIVERED') m[c].delivered += 1; }
      rows = Object.values(m); chart = { type: 'bar', label: 'carrier', value: 'shipments' }; break;
    }
    case 'confirmed-deliveries':
      columns = [col('requestNo', 'Request No.'), col('company', 'Company'), col('mode', 'Delivery Mode'), col('deliveredDate', 'Delivered Date'), col('result', 'Delivery Result'), col('proof', 'Delivery Proof')];
      rows = reqs.filter((r) => r.status === 'DELIVERED' || d.shipments[r.requestNo]?.deliveredAt).map((r) => { const s = d.shipments[r.requestNo] || {}; const cl = checklist(d, r); const proof = cl.items.some((i) => ['DELIVERY', 'COLLECTION_PROOF', 'HANDOVER'].includes(i.key) && ['APPROVED', 'PENDING_REVIEW'].includes(i.state)); return { requestNo: r.requestNo, company: r.customer.company, mode: DELIVERY_MODE_LABEL[r.deliveryMode] || 'Not defined', deliveredDate: s.deliveredAt ? String(s.deliveredAt).slice(0, 10) : fmtDate(r.statusDates?.DELIVERED), result: (s.deliveryResult || '').replace(/_/g, ' ') || 'Not recorded', proof: proof ? 'Yes' : 'No' }; });
      break;
    case 'evidence-completeness':
      columns = [col('requestNo', 'Request No.'), col('status', 'Status'), col('mode', 'Delivery Mode'), col('pct', 'Documentation %', 'n'), col('light', 'Traffic Light'), col('missing', 'Missing or Pending Items')];
      rows = reqs.map((r) => { const cl = checklist(d, r); return { requestNo: r.requestNo, status: STATUS_LABEL[r.status], mode: DELIVERY_MODE_LABEL[r.deliveryMode] || 'Not defined', pct: cl.pct, light: { GREEN: 'Green', AMBER: 'Amber', RED: 'Red' }[cl.light], missing: cl.items.filter((i) => !['APPROVED', 'COMPLETE'].includes(i.state)).map((i) => `${i.label} (${i.state.replace('_', ' ').toLowerCase()})`).join('; ') || 'None' }; });
      break;
    case 'avg-preparation-time':
      columns = [col('month', 'Month'), col('prepared', 'Requests Prepared', 'n'), col('avgPrep', 'Average Preparation Time (business h)', 'n'), col('target', 'Target (business h)', 'n')];
      rows = groupMonth((m, a) => { const t = a.map((r) => requestTimes(ctx, r, tc).prepHours).filter((x) => x !== null); return { month: m, prepared: t.length, avgPrep: avg(t), target: settings.targets.RECEIVED_TO_PREPARED }; });
      chart = { type: 'line', label: 'month', value: 'avgPrep' }; break;
    case 'avg-shipping-time':
      columns = [col('month', 'Month'), col('shipped', 'Requests Shipped', 'n'), col('avgShip', 'Average Time to Ship (business h)', 'n'), col('avgDelivery', 'Average Time to Delivery (business h)', 'n')];
      rows = groupMonth((m, a) => { const t = a.map((r) => requestTimes(ctx, r, tc)); return { month: m, shipped: t.filter((x) => x.toShipHours !== null).length, avgShip: avg(t.map((x) => x.toShipHours)), avgDelivery: avg(t.map((x) => x.toDeliveryHours)) }; });
      chart = { type: 'line', label: 'month', value: 'avgShip' }; break;
    case 'incidents-delays': {
      columns = [col('requestNo', 'Request No.'), col('type', 'Incident Type'), col('severity', 'Severity'), col('detail', 'Detail'), col('date', 'Date')];
      const set = new Set(reqs.map((r) => r.requestNo));
      rows = computeAlerts(ctx, 'CESANTONI').filter((a) => a.severity !== 'INFO' && String(a.requestNo).split(/[ ,/]+/).some((n) => set.has(n))).map((a) => ({ requestNo: a.requestNo, type: a.type.replace(/_/g, ' '), severity: a.severity, detail: a.message, date: 'Current' }));
      for (const h of d.statusHistory.filter((x) => x.exception && set.has(x.requestNo))) rows.push({ requestNo: h.requestNo, type: 'STATUS EXCEPTION', severity: 'WARNING', detail: `${STATUS_LABEL[h.to]} without: ${h.exception.missing.join(', ')} — ${h.exception.reason}`, date: fmtDate(h.at) });
      for (const e of d.evidence.filter((x) => x.state === 'RETURNED' && set.has(x.requestNo))) rows.push({ requestNo: e.requestNo, type: 'EVIDENCE RETURNED', severity: 'WARNING', detail: `${EVIDENCE_LABEL[e.type]}: ${e.review?.notes || ''}`, date: fmtDate(e.review?.at) });
      break;
    }
    case 'top-customers': {
      columns = [col('company', 'Company'), col('country', 'Country'), col('requests', 'Requests', 'n'), col('pieces', 'Pieces', 'n')];
      const m = {};
      for (const r of reqs) { const k = r.customer.company || r.customer.fullName || 'Not provided'; m[k] = m[k] || { company: k, country: r.country, requests: 0, pieces: 0 }; m[k].requests += 1; m[k].pieces += r.lines.reduce((s, l) => s + (l.pieces || 0), 0); }
      rows = Object.values(m).sort((a, b) => b.requests - a.requests); chart = { type: 'bar', label: 'company', value: 'requests' }; break;
    }
    case 'top-products': {
      columns = [col('model', 'Model'), col('color', 'Color'), col('size', 'Piece Size'), col('sku', 'SKU'), col('times', 'Times Requested', 'n'), col('pieces', 'Pieces Requested', 'n')];
      const m = {};
      for (const r of reqs) for (const l of r.lines) { const k = [l.model, l.color, l.pieceSize].join('|'); m[k] = m[k] || { model: l.model, color: l.color, size: l.pieceSize, sku: l.sku || 'Not registered', times: 0, pieces: 0 }; m[k].times += 1; m[k].pieces += l.pieces || 0; }
      rows = Object.values(m).sort((a, b) => b.pieces - a.pieces); chart = { type: 'bar', label: 'model', value: 'pieces' }; break;
    }
    case 'inventory-consumption': {
      columns = [col('model', 'Model'), col('color', 'Color'), col('format', 'Format'), col('type', 'Sample Type'), col('location', 'Location'), col('reserved', 'Reserved in Period', 'n'), col('issued', 'Issued in Period', 'n'), col('onHand', 'Current On Hand', 'n')];
      const inP = (at) => (!f.from || fmtDate(at) >= f.from) && (!f.to || fmtDate(at) <= f.to) && (!f.year || fmtDate(at).startsWith(f.year));
      const m = {};
      for (const mv of d.movements.filter((x) => inP(x.at))) { const it = d.inventory[mv.itemId]; if (!it) continue; m[mv.itemId] = m[mv.itemId] || { model: it.model, color: it.color, format: it.format, type: it.sampleType, location: it.location, reserved: 0, issued: 0, onHand: it.onHand }; if (mv.type === 'RESERVE') m[mv.itemId].reserved += mv.qty; if (mv.type === 'ISSUE') m[mv.itemId].issued += mv.qty; }
      rows = Object.values(m).sort((a, b) => b.issued - a.issued); break;
    }
    case 'logistics-costs':
      columns = [col('requestNo', 'Request No.'), col('company', 'Company'), col('carrier', 'Carrier'), col('trackingNo', 'Tracking No.'), col('month', 'Shipment Month'), col('criterion', 'Period Criterion'), col('costUsd', 'Shipping Cost (USD)', 'usd'), col('invoice', 'Invoice')];
      rows = financeSummary(d, tz, { year: f.year, month: f.month, carrier: f.carrier }).shipments.filter((s) => reqs.some((r) => r.requestNo === s.requestNo)).map((s) => ({ ...s, carrier: carrierName(ctx, s.carrier), costUsd: s.costUsd, invoice: s.invoice || 'Unmatched' }));
      break;
    case 'monthly-billing': {
      columns = [col('month', 'Month'), col('invoicedUsd', 'Invoiced (USD)', 'usd'), col('recordedCostUsd', 'Recorded Shipping Cost (USD)', 'usd'), col('shipments', 'Shipments', 'n'), col('invoices', 'Invoices', 'n')];
      const fin = financeSummary(d, tz, { year: f.year, month: f.month, carrier: f.carrier });
      rows = fin.months.map((m) => ({ ...m, invoices: fin.invoices.filter((i) => i.issueDate.startsWith(m.month)).length }));
      chart = { type: 'bar', label: 'month', value: 'invoicedUsd' }; break;
    }
    case 'held-by-notices':
      columns = [col('type', 'Notice Type'), col('start', 'Start Date'), col('end', 'End Date'), col('count', 'Affected Requests', 'n'), col('requests', 'Request Numbers'), col('sent', 'Emails Sent', 'n'), col('notSent', 'Emails Queued or Failed', 'n'), col('status', 'Notice Status')];
      rows = d.notices.filter((n) => (!f.from || n.end >= f.from) && (!f.to || n.start <= f.to)).map((n) => { const em = d.emails.filter((e) => e.noticeId === n.id); return { type: NOTICE_LABEL[n.category], start: n.start, end: n.end, count: n.requestNos.length, requests: n.requestNos.join(', '), sent: em.filter((e) => e.status === 'SENT').length, notSent: em.filter((e) => e.status !== 'SENT').length, status: n.status }; });
      break;
    case 'logistics-efficiency':
      columns = [col('month', 'Month'), col('requests', 'Requests', 'n'), col('delivered', 'Delivered', 'n'), col('onTimePrep', 'On-Time Preparation %', 'n'), col('avgPrep', 'Avg. Preparation (business h)', 'n'), col('avgShip', 'Avg. Time to Ship (business h)', 'n'), col('documented', 'Documentation Complete %', 'n')];
      rows = groupMonth((m, a) => { const t = a.map((r) => requestTimes(ctx, r, tc)); const prepared = t.filter((x) => x.prepHours !== null); return { month: m, requests: a.length, delivered: a.filter((r) => r.status === 'DELIVERED').length, onTimePrep: pct(prepared.filter((x) => x.prepHours <= settings.targets.RECEIVED_TO_PREPARED).length, prepared.length), avgPrep: avg(t.map((x) => x.prepHours)), avgShip: avg(t.map((x) => x.toShipHours)), documented: pct(a.filter((r) => checklist(d, r).documented).length, a.length) }; });
      chart = { type: 'line', label: 'month', value: 'onTimePrep' }; break;
    default: return null;
  }
  return { id, title: def[1], columns, rows, chart, filters: f, generatedAt: new Date().toISOString() };
}

export { dashboard, report, REPORTS, filterOptions, filtered };
