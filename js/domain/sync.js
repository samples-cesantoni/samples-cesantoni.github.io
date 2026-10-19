// Upserts data read from the original Sample Request base. The source is never written.
// Identity = request number + REQUEST ID; numbering is preserved exactly as received.
import { logEvent } from './common.js';
import { STATUSES } from './catalog.js';

function applySourceSnapshot(d, { requests = [], tracking = [], catalog = { items: [], physical: [] } }, source) {
  const at = new Date().toISOString();
  const summary = { created: 0, updated: 0, unchanged: 0, conflicts: 0, itemsCreated: 0, itemsUpdated: 0, stockDiscrepancies: 0 };
  const trackByNo = new Map(tracking.map((t) => [t.requestNo, t]));

  for (const r of requests) {
    const existing = d.requests[r.requestNo];
    const t = trackByNo.get(r.requestNo);
    if (existing && existing.requestId && r.requestId && existing.requestId !== r.requestId) {
      summary.conflicts += 1;
      d.syncLog.push({ at, requestNo: r.requestNo, action: 'CONFLICT', detail: 'Same request number with a different REQUEST ID — not overwritten', source });
      continue;
    }
    const sourceFields = { requestId: r.requestId, createdAt: r.createdAt, customer: r.customer, country: r.country, state: r.state, city: r.city, zip: r.zip, address: r.address, deliveryRefs: r.deliveryRefs, lines: r.lines, sourceNotes: r.sourceNotes };
    if (!existing) {
      const status = STATUSES.includes((t?.status || r.sourceStatus || '').toUpperCase()) ? (t?.status || r.sourceStatus).toUpperCase() : 'RECEIVED';
      d.requests[r.requestNo] = {
        requestNo: r.requestNo, ...sourceFields, status, deliveryMode: null, statusDates: { RECEIVED: r.createdAt || at }, statusChangedAt: r.createdAt || at,
        observations: [], syncedAt: at, source,
      };
      d.statusHistory.push({ id: `STH-SRC-${r.requestNo}`, requestNo: r.requestNo, from: null, to: status, at: r.createdAt || at, area: 'SYSTEM', notes: 'Imported from Sample Request base', exception: null });
      logEvent(d, { requestNo: r.requestNo, event: 'Request received', area: 'SYSTEM', at: r.createdAt || at });
      if (t?.trackingNo && !d.shipments[r.requestNo]) d.shipments[r.requestNo] = { requestNo: r.requestNo, trackingNo: t.trackingNo, carrier: '', source: 'TRACKING sheet' };
      summary.created += 1;
      d.syncLog.push({ at, requestNo: r.requestNo, action: 'CREATED', detail: `${r.lines.length} line(s)`, source });
    } else if (JSON.stringify(pick(existing, Object.keys(sourceFields))) !== JSON.stringify(sourceFields)) {
      Object.assign(existing, sourceFields, { syncedAt: at });
      summary.updated += 1;
      d.syncLog.push({ at, requestNo: r.requestNo, action: 'UPDATED', detail: 'Source data changed', source });
    } else summary.unchanged += 1;
  }

  for (const it of catalog.items) {
    const ex = d.inventory[it.itemId];
    if (!ex) {
      d.inventory[it.itemId] = { ...it, sourceOnHand: it.onHand, inSource: true, importedAt: at };
      summary.itemsCreated += 1;
    } else {
      const { onHand, ...desc } = it;
      Object.assign(ex, desc, { inSource: true });
      if (ex.sourceOnHand !== onHand) { ex.sourceOnHand = onHand; summary.stockDiscrepancies += onHand !== ex.onHand ? 1 : 0; summary.itemsUpdated += 1; }
    }
  }
  const seen = new Set(catalog.items.map((i) => i.itemId));
  for (const ex of Object.values(d.inventory)) if (!seen.has(ex.itemId) && catalog.items.length) ex.inSource = false; // never deleted
  if (catalog.physical.length) d.physicalInventory = catalog.physical;

  d.meta.lastSync = at;
  d.meta.source = source;
  d.syncLog.push({ at, requestNo: null, action: 'SYNC', detail: JSON.stringify(summary), source });
  return summary;
}
function pick(o, keys) { const r = {}; for (const k of keys) r[k] = o[k]; return r; }

export { applySourceSnapshot };
