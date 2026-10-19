import { rid } from './common.js';
// CESANTONI-only module. Amounts are USD and are never converted.
import { AppError, logEvent } from './common.js';
import { monthKey } from './time.js';

const money = (v) => {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n) || n < 0) throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a non-negative USD value');
  return Math.round(n * 100) / 100;
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function saveInvoice(d, input, area) {
  const invoiceNo = String(input.invoiceNo || '').trim();
  if (!invoiceNo) throw new AppError(400, 'INVOICE_NO_REQUIRED', 'Invoice number is required');
  if (!ISO.test(input.issueDate || '')) throw new AppError(400, 'INVALID_DATE', 'Issue date is required');
  const carrier = String(input.carrier || '').trim();
  if (!carrier) throw new AppError(400, 'CARRIER_REQUIRED', 'Carrier / supplier is required');
  const requestNos = [...new Set((input.requestNos || []).map(String))];
  for (const no of requestNos) if (!d.requests[no]) throw new AppError(400, 'REQUEST_NOT_FOUND', `Request ${no} not found`);
  const totalUsd = money(input.totalUsd);
  const dup = d.invoices.find((i) => i.invoiceNo.toUpperCase() === invoiceNo.toUpperCase() && i.carrier.toUpperCase() === carrier.toUpperCase() && i.id !== input.id);
  if (dup) throw new AppError(409, 'DUPLICATE_INVOICE', 'This invoice number is already registered for this carrier');
  for (const no of requestNos) {
    const other = d.invoices.find((i) => i.id !== input.id && i.requestNos.includes(no));
    if (other) throw new AppError(409, 'REQUEST_ALREADY_INVOICED', `${no} is already linked to invoice ${other.invoiceNo}`);
  }
  const reconciliation = ['PENDING', 'MATCHED', 'DISPUTED'].includes(input.reconciliation) ? input.reconciliation : 'PENDING';
  let inv;
  if (input.id) {
    inv = d.invoices.find((i) => i.id === input.id);
    if (!inv) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
    Object.assign(inv, { invoiceNo, issueDate: input.issueDate, carrier, totalUsd, requestNos, notes: String(input.notes || ''), reconciliation, updatedAt: new Date().toISOString() });
    if (input.pdfFileId) inv.pdfFileId = input.pdfFileId;
  } else {
    inv = { id: rid('INV'), invoiceNo, issueDate: input.issueDate, carrier, totalUsd, currency: 'USD', requestNos, notes: String(input.notes || ''), reconciliation, pdfFileId: input.pdfFileId || null, createdAt: new Date().toISOString() };
    d.invoices.push(inv);
  }
  logEvent(d, { event: `Invoice ${input.id ? 'updated' : 'registered'}: ${invoiceNo}`, area });
  return { invoice: inv };
}

function setShippingCost(d, requestNo, input, area) {
  if (!d.requests[requestNo]) throw new AppError(404, 'REQUEST_NOT_FOUND', 'Request not found');
  const amountUsd = input.amountUsd === '' || input.amountUsd === null ? null : money(input.amountUsd);
  d.shippingCosts[requestNo] = { requestNo, amountUsd, currency: 'USD', notes: String(input.notes || ''), recordedAt: new Date().toISOString() };
  logEvent(d, { requestNo, event: 'Shipping cost recorded', area });
  d.sheetOutbox.push({ kind: 'OPERATION', requestNo, at: new Date().toISOString() });
  return { cost: d.shippingCosts[requestNo] };
}

// Shipment date used to place a not-yet-invoiced shipment in a month, with the criterion used.
function shipmentPeriod(d, req, tz) {
  const s = d.shipments[req.requestNo] || {};
  if (s.shipDate) return { month: s.shipDate.slice(0, 7), criterion: 'Carrier drop-off date' };
  if (req.statusDates?.SHIPPED) return { month: monthKey(req.statusDates.SHIPPED, tz), criterion: 'Date marked as shipped' };
  return { month: monthKey(req.createdAt, tz), criterion: 'Request date (no shipping date available)' };
}

function isShipment(d, req) {
  const s = d.shipments[req.requestNo];
  return Boolean(s?.trackingNo || s?.shipDate || req.statusDates?.SHIPPED);
}

function financeSummary(d, tz, f = {}) {
  const inMonth = (m) => (!f.year || m.startsWith(f.year)) && (!f.month || m.slice(5, 7) === String(f.month).padStart(2, '0'));
  const invoices = d.invoices.filter((i) => inMonth(i.issueDate.slice(0, 7)) && (!f.carrier || i.carrier === f.carrier) && (!f.reconciliation || i.reconciliation === f.reconciliation) && (!f.invoiceNo || i.invoiceNo.toUpperCase().includes(String(f.invoiceNo).toUpperCase())));
  const linked = new Set(d.invoices.flatMap((i) => i.requestNos));
  const shipments = Object.values(d.requests).filter((r) => isShipment(d, r)).map((r) => {
    const p = shipmentPeriod(d, r, tz);
    const s = d.shipments[r.requestNo] || {};
    return { requestNo: r.requestNo, company: r.customer.company, carrier: s.carrier || '', trackingNo: s.trackingNo || '', month: p.month, criterion: p.criterion, costUsd: d.shippingCosts[r.requestNo]?.amountUsd ?? null, invoice: d.invoices.find((i) => i.requestNos.includes(r.requestNo))?.invoiceNo || null, matched: linked.has(r.requestNo) };
  }).filter((s) => inMonth(s.month) && (!f.carrier || s.carrier === f.carrier));
  const sum = (a) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
  const costs = shipments.filter((s) => s.costUsd !== null);
  const months = {};
  for (const i of invoices) { const m = i.issueDate.slice(0, 7); months[m] = months[m] || { month: m, invoicedUsd: 0, recordedCostUsd: 0, shipments: 0 }; months[m].invoicedUsd = sum([months[m].invoicedUsd, i.totalUsd]); }
  for (const s of shipments) { months[s.month] = months[s.month] || { month: s.month, invoicedUsd: 0, recordedCostUsd: 0, shipments: 0 }; months[s.month].shipments += 1; if (s.costUsd !== null) months[s.month].recordedCostUsd = sum([months[s.month].recordedCostUsd, s.costUsd]); }
  return {
    kpis: {
      monthlyInvoicedUsd: sum(invoices.map((i) => i.totalUsd)),
      recordedShippingCostsUsd: sum(costs.map((s) => s.costUsd)),
      pendingInvoices: invoices.filter((i) => i.reconciliation === 'PENDING').length,
      matchedShipments: shipments.filter((s) => s.matched).length,
      unmatchedShipments: shipments.filter((s) => !s.matched).length,
      averageCostPerShipmentUsd: costs.length ? sum(costs.map((s) => s.costUsd)) / costs.length : null,
    },
    invoices, shipments, months: Object.values(months).sort((a, b) => a.month.localeCompare(b.month)),
    note: 'Invoices are grouped by issue month. Shipments are grouped by carrier drop-off date, falling back to the date marked as shipped, then to the request date (criterion shown per row).',
  };
}

export { saveInvoice, setShippingCost, financeSummary, isShipment, shipmentPeriod };
