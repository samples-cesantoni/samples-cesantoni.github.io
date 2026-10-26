import { rid } from './common.js';
import { AppError, logEvent, getRequest } from './common.js';
import { STATUSES, STATUS_LABEL, FLOW, FINAL_STATUSES } from './catalog.js';
import { checklist } from './checklist.js';
import { statusEmail, queueEmail, EMAIL_RE } from './email.js';

// Requirements that must be met (or explicitly excepted) before entering a status.
function requirements(d, req, to) {
  const cl = checklist(d, req);
  const has = (key) => {
    const i = cl.items.find((x) => x.key === key);
    return i ? ['APPROVED', 'COMPLETE', 'PENDING_REVIEW'].includes(i.state) : null;
  };
  const out = [];
  const add = (key, label, ok) => { if (ok !== null) out.push({ key, label, ok }); };
  if (['PREPARED', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(to)) add('PREPARATION', 'Preparation evidence uploaded', has('PREPARATION'));
  if (['SHIPPED', 'IN_TRANSIT'].includes(to) || (to === 'DELIVERED' && req.deliveryMode === 'COURIER')) {
    if (req.deliveryMode && req.deliveryMode !== 'COURIER') out.push({ key: 'MODE', label: 'Delivery mode is courier shipment', ok: false });
    out.push({ key: 'TRACKING_NUMBER', label: 'Tracking number captured', ok: Boolean(d.shipments[req.requestNo]?.trackingNo) });
    add('SHIPPING_LABEL', 'Shipping label photo uploaded', has('SHIPPING_LABEL') ?? false);
    add('DROPOFF', 'Carrier drop-off proof uploaded', has('DROPOFF') ?? false);
  }
  if (to === 'DELIVERED') {
    if (!req.deliveryMode) out.push({ key: 'MODE', label: 'Delivery mode defined', ok: false });
    for (const k of ['DELIVERY', 'PICKUP_CONFIRMATION', 'COLLECTION_PROOF', 'HANDOVER']) {
      const i = cl.items.find((x) => x.key === k);
      if (i) out.push({ key: k, label: `${i.label} uploaded`, ok: ['APPROVED', 'PENDING_REVIEW'].includes(i.state) });
    }
  }
  return out;
}

function consistency(req, to) {
  const flow = FLOW[req.deliveryMode] || FLOW.null;
  const warnings = [];
  if (to === req.status) warnings.push('The request already has this status.');
  if (FINAL_STATUSES.includes(req.status)) warnings.push(`The request is ${STATUS_LABEL[req.status]}; reopening it is unusual.`);
  if (!['ON_HOLD', 'CANCELLED'].includes(to)) {
    const from = req.status === 'ON_HOLD' ? (req.lastActiveStatus || 'RECEIVED') : req.status;
    if (flow.indexOf(to) < 0) warnings.push(`${STATUS_LABEL[to]} is not part of the ${req.deliveryMode || 'default'} flow.`);
    else if (flow.indexOf(from) >= 0 && flow.indexOf(to) < flow.indexOf(from)) warnings.push(`Moving backwards from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.`);
  }
  return warnings;
}

function previewChange(ctx, { requestNo, to, notes }) {
  const d = ctx.store.data;
  const req = getRequest(d, requestNo);
  if (!STATUSES.includes(to)) throw new AppError(400, 'INVALID_STATUS', 'Unknown status');
  const email = statusEmail({ req, status: to, shipment: d.shipments[requestNo], observations: notes, timeZone: ctx.config.timeZone, logoSrc: '/assets/logo-cesantoni.png', carriers: ctx.settings().carriers });
  return {
    current: req.status, to, requirements: requirements(d, req, to), warnings: consistency(req, to),
    recipient: req.customer.email, emailMode: ctx.config.email.mode, provider: ctx.config.email.provider,
    email: { subject: email.subject, html: email.html },
  };
}

// Only CESANTONI reaches this function (enforced by the route).
function changeStatus(ctx, { requestNo, to, notes, notify, opKey, exceptionReason, confirmInconsistent }) {
  const { store, config } = ctx;
  return store.tx((d) => {
    if (opKey && d.operations[opKey]) return { ...d.operations[opKey], replayed: true };
    const req = getRequest(d, requestNo);
    if (!STATUSES.includes(to)) throw new AppError(400, 'INVALID_STATUS', 'Unknown status');
    if (to === req.status) throw new AppError(409, 'SAME_STATUS', 'The request already has this status');
    const reqs = requirements(d, req, to);
    const missing = reqs.filter((r) => !r.ok);
    if (missing.length && String(exceptionReason || '').trim().length < 10) {
      throw new AppError(422, 'REQUIREMENTS_MISSING', 'Mandatory evidence is missing. Record an authorized exception (min. 10 characters) to continue.', { missing });
    }
    const warnings = consistency(req, to);
    if (warnings.length && !confirmInconsistent) throw new AppError(409, 'CONFIRM_INCONSISTENT', 'This change is inconsistent with the normal flow and must be confirmed.', { warnings });

    const at = new Date().toISOString();
    const from = req.status;
    if (to === 'ON_HOLD' || to === 'CANCELLED') req.lastActiveStatus = from === 'ON_HOLD' ? req.lastActiveStatus : from;
    req.status = to;
    req.statusChangedAt = at;
    req.statusDates = req.statusDates || {};
    if (!req.statusDates[to]) req.statusDates[to] = at;
    const entry = {
      id: rid('STH'), requestNo, from, to, at, area: 'CESANTONI',
      notes: String(notes || '').slice(0, 1000), exception: missing.length ? { reason: String(exceptionReason).slice(0, 500), missing: missing.map((m) => m.key) } : null,
    };
    d.statusHistory.push(entry);
    logEvent(d, { requestNo, event: `Status updated: ${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}${entry.exception ? ' (authorized exception)' : ''}`, area: 'CESANTONI', at });
    d.sheetOutbox.push({ kind: 'STATUS_HISTORY', historyId: entry.id, at });

    let email = null;
    if (notify) {
      const card = statusEmail({ req, status: to, shipment: d.shipments[requestNo], observations: notes, timeZone: config.timeZone, logoSrc: 'cid:cesantoniLogo', carriers: ctx.settings().carriers });
      email = queueEmail(d, { opKey: opKey ? `status:${opKey}` : null, requestNos: [requestNo], type: 'STATUS_UPDATE', to: req.customer.email, ...card });
    }
    const result = { history: entry, emailId: email ? email.id : null };
    if (opKey) d.operations[opKey] = result;
    return result;
  });
}

// Automatic status: once a request has its tracking number AND a shipping label photo,
// it moves to Shipped by itself (whoever captured the last of the two). Recorded as SYSTEM.
// The customer email is not sent from here: CESANTONI's session queues it for approval.
const AUTO_SHIP_FROM = ['RECEIVED', 'PREPARING', 'PREPARED'];
function autoShip(d, requestNo) {
  const req = d.requests[requestNo];
  if (!req || !AUTO_SHIP_FROM.includes(req.status) || ![null, undefined, '', 'COURIER'].includes(req.deliveryMode)) return null;
  if (!d.shipments[requestNo]?.trackingNo) return null;
  if (!d.evidence.some((e) => e.requestNo === requestNo && e.type === 'SHIPPING_LABEL_PHOTO' && !e.supersededBy && e.state !== 'RETURNED')) return null;
  const at = new Date().toISOString();
  const from = req.status;
  req.status = 'SHIPPED';
  req.statusChangedAt = at;
  req.statusDates = { ...(req.statusDates || {}) };
  if (!req.statusDates.SHIPPED) req.statusDates.SHIPPED = at;
  const entry = { id: rid('STH'), requestNo, from, to: 'SHIPPED', at, area: 'SYSTEM', auto: true, notes: 'Automatic: tracking number and shipping label photo registered', exception: null };
  d.statusHistory.push(entry);
  logEvent(d, { requestNo, event: `Status updated automatically: ${STATUS_LABEL[from]} → ${STATUS_LABEL.SHIPPED} (tracking and label registered)`, area: 'SYSTEM', at });
  d.sheetOutbox.push({ kind: 'STATUS_HISTORY', historyId: entry.id, at });
  return entry;
}

// CESANTONI session: queue the customer email of each automatic change once (never sent by itself).
const pendingAuto = (d) => d.statusHistory.filter((h) => h.auto && d.requests[h.requestNo]?.status === h.to && EMAIL_RE.test(String(d.requests[h.requestNo].customer?.email || ''))
  && !d.emails.some((e) => e.opKey === `auto:${h.id}`));
function queueAutoEmails(ctx, d) {
  let n = 0;
  for (const h of pendingAuto(d)) {
    const key = `auto:${h.id}`;
    const req = d.requests[h.requestNo];
    try {
      const card = statusEmail({ req, status: h.to, shipment: d.shipments[h.requestNo], observations: '', timeZone: ctx.config.timeZone, logoSrc: 'cid:cesantoniLogo', carriers: ctx.settings().carriers });
      const e = queueEmail(d, { opKey: key, requestNos: [h.requestNo], type: 'STATUS_UPDATE', to: req.customer.email, ...card });
      e.statusReason = 'Automatic status change — not sent until CESANTONI presses Retry';
      n += 1;
    } catch { /* no valid customer email: CESANTONI sees the change in the history */ }
  }
  return n;
}

function setDeliveryMode(d, requestNo, mode, area) {
  const req = getRequest(d, requestNo);
  if (!['COURIER', 'PICKUP', 'WAREHOUSE'].includes(mode)) throw new AppError(400, 'INVALID_MODE', 'Invalid delivery mode');
  if (req.deliveryMode === mode) return { request: req };
  req.deliveryMode = mode;
  logEvent(d, { requestNo, event: `Delivery mode set: ${mode}`, area });
  return { request: req };
}

export { requirements, consistency, previewChange, changeStatus, setDeliveryMode, autoShip, queueAutoEmails, pendingAuto };
