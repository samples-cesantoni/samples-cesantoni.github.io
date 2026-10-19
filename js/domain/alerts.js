import { FINAL_STATUSES, STATUS_LABEL } from './catalog.js';
import { checklist } from './checklist.js';
import { lineAllocation } from './inventory.js';
import { timeCtx, requestTimes, overdue } from './metrics.js';
import { findDuplicates } from './duplicates.js';

// Alert types visible to the warehouse (capture, inventory and documentation only).
const BODEGA_TYPES = new Set(['NOT_PREPARED', 'MISSING_EVIDENCE', 'TRACKING_PENDING', 'DROPOFF_MISSING', 'EVIDENCE_RETURNED', 'INVENTORY_SHORTAGE', 'OVERDUE']);

function computeAlerts(ctx, area) {
  const d = ctx.store.data;
  const settings = ctx.settings();
  const tc = timeCtx(ctx);
  const out = [];
  const add = (type, severity, requestNo, message) => out.push({ type, severity, requestNo, message });
  for (const req of Object.values(d.requests)) {
    if (FINAL_STATUSES.includes(req.status)) continue;
    const no = req.requestNo;
    const times = requestTimes(ctx, req, tc);
    const cl = checklist(d, req);
    if (req.status === 'RECEIVED' && times.sinceCreatedHours > settings.targets.RECEIVED_TO_PREPARED / 2) add('NOT_PREPARED', 'WARNING', no, `No preparation started after ${times.sinceCreatedHours} business hours`);
    const late = overdue(ctx, req, times, settings);
    if (late) add('OVERDUE', 'CRITICAL', no, `${late.stage} stage over target: ${late.actual} h vs ${late.target} h (business hours)`);
    for (const i of cl.items) {
      if (i.due && i.state === 'MISSING' && i.key !== 'TRACKING_NUMBER') add('MISSING_EVIDENCE', i.critical ? 'CRITICAL' : 'WARNING', no, `${i.label} missing`);
    }
    if (req.status === 'PREPARED' && (req.deliveryMode === 'COURIER' || !req.deliveryMode) && !d.shipments[no]?.trackingNo) add('TRACKING_PENDING', 'WARNING', no, 'Tracking number pending');
    if (['SHIPPED', 'IN_TRANSIT'].includes(req.status)) {
      const drop = cl.items.find((i) => i.key === 'DROPOFF');
      if (drop && drop.state === 'MISSING') add('DROPOFF_MISSING', 'CRITICAL', no, 'Carrier drop-off proof missing');
      if (!d.shipments[no]?.deliveredAt) add('DELIVERY_UNCONFIRMED', 'INFO', no, 'Delivery pending confirmation');
    }
    if (d.evidence.some((e) => e.requestNo === no && e.state === 'RETURNED' && !e.supersededBy)) add('EVIDENCE_RETURNED', 'CRITICAL', no, 'Evidence returned by CESANTONI — upload a correction');
    if (req.status === 'ON_HOLD') add('ON_HOLD', 'WARNING', no, `On hold (previous status: ${STATUS_LABEL[req.lastActiveStatus] || '—'})`);
    if (!req.deliveryMode) add('MODE_MISSING', 'WARNING', no, 'Delivery mode not defined');
    if (lineAllocation(d, no).some((l) => l.shortage)) add('INVENTORY_SHORTAGE', 'CRITICAL', no, 'Insufficient stock for at least one line');
    const pending = d.evidence.filter((e) => e.requestNo === no && e.state === 'PENDING' && !e.supersededBy).length;
    if (pending) add('PENDING_REVIEW', 'INFO', no, `${pending} evidence file(s) awaiting validation`);
  }
  if (area === 'CESANTONI') {
    for (const dup of findDuplicates(d, settings)) if (!dup.decision) add('POSSIBLE_DUPLICATE', 'WARNING', dup.requests.join(' / '), dup.reasons.join(' · '));
    for (const e of d.emails) {
      if (e.status === 'FAILED') add('EMAIL_FAILED', 'CRITICAL', e.requestNos.join(', '), `Email failed: ${e.error}`);
      else if (e.status === 'QUEUED') add('EMAIL_QUEUED', 'INFO', e.requestNos.join(', '), e.statusReason || 'Email queued');
    }
  }
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return out.filter((a) => area === 'CESANTONI' || BODEGA_TYPES.has(a.type)).sort((a, b) => order[a.severity] - order[b.severity]);
}

export { computeAlerts, BODEGA_TYPES };
