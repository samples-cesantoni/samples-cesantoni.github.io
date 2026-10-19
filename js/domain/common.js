import { sha1 } from './sha1.js';
// Deterministic id for emails tied to an operation key: a second attempt collides instead of duplicating.
const emailIdFor = (opKey) => 'EML-' + sha1(opKey).slice(0, 24);
// Collision-safe ids: several browsers write to the same database.
function rid(prefix) { const b = new Uint8Array(6); crypto.getRandomValues(b); return `${prefix}-${Date.now().toString(36)}-${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`; }
class AppError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
const VISIBLE_AREA = { CESANTONI: 'CESANTONI', BODEGA: 'Warehouse', SYSTEM: 'System' };

// Visible activity log: records WHAT happened and WHICH AREA did it — never a person.
function logEvent(d, { requestNo = null, event, area = 'SYSTEM', at = new Date().toISOString() }) {
  d.events.push({ id: rid('EVT'), at, requestNo, event, area: VISIBLE_AREA[area] || area });
}
function getRequest(d, requestNo) {
  const r = d.requests[requestNo];
  if (!r) throw new AppError(404, 'REQUEST_NOT_FOUND', `Request ${requestNo} not found`);
  return r;
}
// Idempotency: the same operation key always returns the first result.
function once(d, opKey, fn) {
  if (opKey && d.operations[opKey]) return { ...d.operations[opKey], replayed: true };
  const result = fn();
  if (opKey) d.operations[opKey] = result;
  return result;
}
export { emailIdFor, rid, AppError, logEvent, getRequest, once, VISIBLE_AREA };
