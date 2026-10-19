// Per-request timing figures computed from real timestamps and business-time rules.
import { businessMinutes } from './time.js';
import { closedDates } from './notices.js';

function timeCtx(ctx) {
  const s = ctx.settings();
  return { businessHours: s.businessHours, timeZone: ctx.config.timeZone, closedDates: closedDates(ctx.store.data, s) };
}
function hoursBetween(tc, a, b) { return a && b ? Math.round((businessMinutes(a, b, tc) / 60) * 10) / 10 : null; }

function requestTimes(ctx, req, tc = timeCtx(ctx)) {
  const sd = req.statusDates || {};
  const ship = ctx.store.data.shipments[req.requestNo] || {};
  const deliveredAt = sd.DELIVERED || (ship.deliveredAt ? new Date(ship.deliveredAt).toISOString() : null);
  return {
    prepHours: hoursBetween(tc, req.createdAt, sd.PREPARED),
    toShipHours: hoursBetween(tc, req.createdAt, sd.SHIPPED),
    toDeliveryHours: hoursBetween(tc, req.createdAt, deliveredAt),
    inStatusHours: hoursBetween(tc, req.statusChangedAt || req.createdAt, new Date().toISOString()),
    sinceCreatedHours: hoursBetween(tc, req.createdAt, new Date().toISOString()),
  };
}

// Is the request outside its target time at its current stage?
function overdue(ctx, req, times, settings) {
  const t = settings.targets;
  const sd = req.statusDates || {};
  if (['RECEIVED', 'PREPARING'].includes(req.status)) return times.sinceCreatedHours > t.RECEIVED_TO_PREPARED ? { stage: 'PREPARATION', target: t.RECEIVED_TO_PREPARED, actual: times.sinceCreatedHours } : null;
  if (req.status === 'PREPARED' && req.deliveryMode !== 'PICKUP' && req.deliveryMode !== 'WAREHOUSE') return times.inStatusHours > t.PREPARED_TO_SHIPPED ? { stage: 'SHIPPING', target: t.PREPARED_TO_SHIPPED, actual: times.inStatusHours } : null;
  if (['SHIPPED', 'IN_TRANSIT'].includes(req.status)) {
    const tc = timeCtx(ctx);
    const h = hoursBetween(tc, sd.SHIPPED || req.statusChangedAt, new Date().toISOString());
    return h > t.SHIPPED_TO_DELIVERED ? { stage: 'DELIVERY', target: t.SHIPPED_TO_DELIVERED, actual: h } : null;
  }
  if (req.status === 'READY_FOR_PICKUP') return times.inStatusHours > t.READY_TO_PICKED_UP ? { stage: 'PICKUP', target: t.READY_TO_PICKED_UP, actual: times.inStatusHours } : null;
  return null;
}

// Was the request (ever) late against targets, using completed stages?
function wasLate(req, times, settings) {
  const t = settings.targets;
  if (times.prepHours !== null && times.prepHours > t.RECEIVED_TO_PREPARED) return true;
  return false;
}

export { timeCtx, requestTimes, overdue, wasLate, hoursBetween };
