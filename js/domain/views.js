// Role-aware projections. Financial fields are only ever attached for CESANTONI, so a
// warehouse session cannot receive them from any endpoint that uses these builders.
import { checklist } from './checklist.js';
import { lineAllocation, physicalAt } from './inventory.js';
import { requestTimes, overdue, timeCtx } from './metrics.js';
import { findDuplicates } from './duplicates.js';
import { requirements } from './status.js';
import { EVIDENCE_LABEL, STAGE_LABEL } from './catalog.js';

function summary(ctx, req, area, tc) {
  const d = ctx.store.data;
  const cl = checklist(d, req);
  const ship = d.shipments[req.requestNo] || {};
  const times = requestTimes(ctx, req, tc);
  const s = {
    requestNo: req.requestNo, createdAt: req.createdAt, customerName: req.customer.fullName, company: req.customer.company,
    country: req.country, state: req.state, city: req.city, zip: req.zip, address: req.address, deliveryMode: req.deliveryMode,
    productCount: req.lines.length, pieces: req.lines.reduce((a, l) => a + (l.pieces || 0), 0), status: req.status,
    docPct: cl.pct, light: cl.light, documented: cl.documented, carrier: ship.carrier || '', trackingNo: ship.trackingNo || '',
    observations: (req.observations || []).length, sourceNotes: req.sourceNotes || '',
    models: req.lines.map((l) => l.model), skus: req.lines.map((l) => l.sku).filter(Boolean),
    overdue: Boolean(overdue(ctx, req, times, ctx.settings())),
  };
  if (area === 'CESANTONI') { s.customerEmail = req.customer.email; s.costUsd = d.shippingCosts[req.requestNo]?.amountUsd ?? null; }
  return s;
}

function fileView(d, fileId) {
  const f = fileId && d.files[fileId];
  return f ? { id: f.id, name: f.name, mime: f.mime, size: f.size, uploadedAt: f.uploadedAt } : null;
}

function detail(ctx, req, area) {
  const d = ctx.store.data;
  const no = req.requestNo;
  const evidence = d.evidence.filter((e) => e.requestNo === no).map((e) => ({
    ...e, typeLabel: EVIDENCE_LABEL[e.type], stageLabel: STAGE_LABEL[e.stage], file: fileView(d, e.fileId),
  }));
  const out = {
    ...summary(ctx, req, area, timeCtx(ctx)),
    phone: req.customer.phone, deliveryRefs: req.deliveryRefs, requestId: req.requestId,
    lines: lineAllocation(d, no).map((l) => ({ ...l, candidates: l.candidates.map(({ itemId, model, color, format, sampleType, location, available, onHand, reserved, sku, preferred }) => {
      const p = physicalAt(d, location, model); // shown as in the warehouse inventory (Excel), not the web catalog
      return { itemId, model: p ? p.model : model, color: p ? (/^\d+(\.\d+)?$/.test(String(p.color || '')) ? '' : p.color) : color, finish: p ? p.finish : '', sampleSize: p ? p.sampleSize : format, format, sampleType, location, available, onHand: p && typeof p.quantity === 'number' ? p.quantity : onHand, reserved, sku, preferred };
    }) })),
    checklist: checklist(d, req), evidence, shipment: d.shipments[no] || null,
    observationsList: req.observations || [], statusDates: req.statusDates || {},
    inventoryExcluded: Boolean(req.inventoryExcluded), inventoryByPlatform: Boolean(d.settings?.inventoryFrom && String(req.createdAt || '') >= d.settings.inventoryFrom),
    history: d.statusHistory.filter((h) => h.requestNo === no).map(({ id, from, to, at, area: a, notes, exception }) => ({ id, from, to, at, area: a === 'BODEGA' ? 'Warehouse' : a === 'SYSTEM' ? 'System' : a, notes, exception })),
    events: d.events.filter((e) => e.requestNo === no),
    times: requestTimes(ctx, req),
    notices: d.notices.filter((n) => n.requestNos.includes(no)).map(({ id, category, start, end, message, status }) => ({ id, category, start, end, message, status })),
  };
  out.documents = evidence.filter((e) => e.file).map((e) => ({ ...e.file, evidenceId: e.id, label: e.typeLabel, state: e.state }));
  if (area === 'CESANTONI') {
    out.customerEmail = req.customer.email;
    out.cost = d.shippingCosts[no] || null;
    out.invoices = d.invoices.filter((i) => i.requestNos.includes(no)).map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, issueDate: i.issueDate, carrier: i.carrier, totalUsd: i.totalUsd, sharedWith: i.requestNos.length, pdf: fileView(d, i.pdfFileId) }));
    out.emails = d.emails.filter((e) => e.requestNos.includes(no)).map(({ id, type, to, subject, status, statusReason, error, createdAt, sentAt, attempts }) => ({ id, type, to, subject, status, statusReason, error, createdAt, sentAt, attempts }));
    out.duplicates = findDuplicates(d, ctx.settings()).filter((x) => x.requests.includes(no));
    out.requirementsShipped = requirements(d, req, 'SHIPPED');
  }
  return out;
}

export { summary, detail, fileView };
