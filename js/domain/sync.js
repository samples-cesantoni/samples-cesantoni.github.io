// Upserts data read from the original Sample Request base. The source is never written.
// Identity = request number + REQUEST ID; numbering is preserved exactly as received.
// The base is the authority for: request data, its status changes, dates and tracking. Inventory is kept
// by the platform since settings.inventoryFrom (see domain/inventory.js).
import { logEvent } from './common.js';
import { STATUSES } from './catalog.js';
import { norm } from './sheet-parse.js';
import { localParts } from './time.js';

const TZ = 'America/Mexico_City';
const STATUS_DATE = { PREPARED: 'preparationDate', SHIPPED: 'shipDate', DELIVERED: 'deliveryDate' };
const validStatus = (s) => (STATUSES.includes(String(s || '').toUpperCase()) ? String(s).toUpperCase() : null);

function applySourceSnapshot(d, { requests = [], tracking = [], operation = [], moves = [], catalog = { items: [], physical: [] } }, source) {
  const at = new Date().toISOString();
  const summary = { created: 0, updated: 0, unchanged: 0, conflicts: 0, statusChanges: 0, itemsCreated: 0, itemsUpdated: 0, moves: 0 };
  const trackByNo = new Map(tracking.map((t) => [t.requestNo, t]));
  const opByNo = new Map(operation.map((o) => [o.requestNo, o]));

  for (const r of requests) {
    const existing = d.requests[r.requestNo];
    const t = trackByNo.get(r.requestNo) || {};
    const op = opByNo.get(r.requestNo) || {};
    if (existing && existing.requestId && r.requestId && existing.requestId !== r.requestId) {
      summary.conflicts += 1;
      d.syncLog.push({ id: `SYN-${r.requestNo}-${Date.now().toString(36)}`, at, requestNo: r.requestNo, action: 'CONFLICT', detail: 'Same request number with a different REQUEST ID — not overwritten', source });
      continue;
    }
    const sourceFields = { requestId: r.requestId, createdAt: r.createdAt, customer: r.customer, country: r.country, state: r.state, city: r.city, zip: r.zip, address: r.address, deliveryRefs: r.deliveryRefs, lines: r.lines, sourceNotes: [r.sourceNotes, t.notes].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · ') };
    const sheetStatus = validStatus(t.status) || validStatus(r.sourceStatus) || 'RECEIVED';
    let req = existing;
    if (!req) {
      req = d.requests[r.requestNo] = {
        requestNo: r.requestNo, ...sourceFields, status: sheetStatus, sourceStatus: sheetStatus, deliveryMode: null,
        statusDates: { RECEIVED: r.createdAt || at }, statusChangedAt: r.createdAt || at, observations: [], syncedAt: at, source,
      };
      d.statusHistory.push({ id: `STH-SRC-${r.requestNo}`, requestNo: r.requestNo, from: null, to: sheetStatus, at: r.createdAt || at, area: 'SYSTEM', notes: 'Imported from Sample Request base', exception: null });
      logEvent(d, { requestNo: r.requestNo, event: 'Request received', area: 'SYSTEM', at: r.createdAt || at });
      summary.created += 1;
    } else {
      const changed = JSON.stringify(pick(existing, Object.keys(sourceFields))) !== JSON.stringify(sourceFields);
      if (changed) { Object.assign(existing, sourceFields, { syncedAt: at }); summary.updated += 1; } else summary.unchanged += 1;
      // A status change made in the base (by its own processes) is applied here and recorded.
      if (existing.sourceStatus !== sheetStatus) {
        if (existing.status !== sheetStatus) {
          const from = existing.status;
          existing.status = sheetStatus; existing.statusChangedAt = at;
          d.statusHistory.push({ id: `STH-SRC-${r.requestNo}-${sheetStatus}-${Date.now().toString(36)}`, requestNo: r.requestNo, from, to: sheetStatus, at, area: 'SYSTEM', notes: 'Updated from Sample Request base', exception: null });
          logEvent(d, { requestNo: r.requestNo, event: `Status updated from Sample Request base: ${from} → ${sheetStatus}`, area: 'SYSTEM', at });
          summary.statusChanges += 1;
        }
        existing.sourceStatus = sheetStatus;
      }
    }
    // Operational dates recorded in the base (only fill what the platform does not have yet).
    req.statusDates = req.statusDates || {};
    for (const [st, key] of Object.entries(STATUS_DATE)) if (t[key] && !req.statusDates[st]) req.statusDates[st] = t[key];
    // Carrier and tracking captured in the base.
    const trackingNo = op.trackingNo || t.trackingNo || '';
    if (trackingNo || op.carrier || t.deliveryDate) {
      const s = d.shipments[r.requestNo] || { requestNo: r.requestNo };
      const before = JSON.stringify(s);
      if (!s.trackingNo && trackingNo) s.trackingNo = trackingNo;
      if (!s.carrier && op.carrier) s.carrier = ['FEDEX', 'UPS', 'DHL', 'USPS', 'ESTAFETA', 'PAQUETEXPRESS'].includes(op.carrier) ? op.carrier : 'OTHER';
      if (s.carrier === 'OTHER' && !s.otherCarrierName && op.carrier) s.otherCarrierName = op.carrier;
      if (!s.carrier && /^1Z[0-9A-Z]{16}$/.test(s.trackingNo || '')) s.carrier = 'UPS';
      if (!s.shipDate && t.shipDate) s.shipDate = localParts(new Date(t.shipDate), TZ).iso;
      if (!s.deliveredAt && t.deliveryDate) s.deliveredAt = t.deliveryDate;
      if (s.carrier === 'UPS' && s.trackingNo && !s.trackingUrl) s.trackingUrl = `https://www.ups.com/track?tracknum=${encodeURIComponent(s.trackingNo)}`;
      if (JSON.stringify(s) !== before) { s.source = s.source || 'Sample Request base'; d.shipments[r.requestNo] = s; }
      if (!req.deliveryMode && (s.trackingNo || s.carrier)) req.deliveryMode = 'COURIER';
    }
  }

  // Inventory. Before the switch (settings.inventoryFrom) the base was the authority and was mirrored.
  // Since the switch the platform keeps the stock: the base only adds new catalog items and the
  // deductions it made for requests older than the switch. Items are never deleted.
  const from = d.settings && d.settings.inventoryFrom;
  const createdNow = new Set();
  for (const it of catalog.items) {
    const ex = d.inventory[it.itemId];
    if (!ex) { d.inventory[it.itemId] = { ...it, sourceOnHand: it.onHand, reserved: 0, inSource: true, importedAt: at }; createdNow.add(it.itemId); summary.itemsCreated += 1; continue; }
    const next = { ...ex, ...it, onHand: from ? ex.onHand : it.onHand, sourceOnHand: it.onHand, inSource: true };
    if (JSON.stringify(next) !== JSON.stringify(ex)) { Object.assign(ex, next); summary.itemsUpdated += 1; }
  }
  const seen = new Set(catalog.items.map((i) => i.itemId));
  for (const ex of Object.values(d.inventory)) if (!seen.has(ex.itemId) && catalog.items.length && ex.inSource !== false) ex.inSource = false;
  if (catalog.physical.length && (!from || !(d.physicalInventory || []).length) && JSON.stringify(catalog.physical) !== JSON.stringify(d.physicalInventory)) d.physicalInventory = catalog.physical;

  // Deductions applied by the base ("MOVIMIENTOS INVENTARIO"), shown as movements of the request.
  const known = new Set(d.movements.map((m) => m.id));
  for (const m of moves) {
    if (known.has(m.id)) continue;
    const req = d.requests[m.requestNo];
    if (from && req && String(req.createdAt || '') >= from) continue; // deducted by the platform itself
    const item = matchItem(d, m);
    let { before, after } = m;
    if (from && item && !createdNow.has(item.itemId)) { before = item.onHand; item.onHand = Math.max(0, item.onHand - (m.qty || 0)); after = item.onHand; } // not mirrored anymore
    d.movements.push({ id: m.id, at: m.at || at, type: 'ISSUE', itemId: item ? item.itemId : null, qty: m.qty, requestNo: m.requestNo, area: 'SYSTEM', source: 'BASE', model: m.model, color: m.color, sampleType: m.sampleType, location: m.location, before, after, note: m.note || 'Deducted by the Sample Request base' });
    summary.moves += 1;
  }

  d.meta = { ...(d.meta || {}), lastSync: at, source };
  d.syncLog.push({ id: `SYN-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`, at, requestNo: null, action: 'SYNC', detail: JSON.stringify(summary), source });
  return summary;
}

function matchItem(d, m) {
  const c = Object.values(d.inventory).filter((i) => norm(i.model) === norm(m.model) && norm(i.color) === norm(m.color));
  return c.find((i) => norm(i.location) === norm(m.location) && norm(i.sampleType) === norm(m.sampleType)) || c.find((i) => norm(i.location) === norm(m.location)) || c.find((i) => norm(i.sampleType) === norm(m.sampleType)) || c[0] || null;
}
function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o[k]; return r; }

export { applySourceSnapshot };
