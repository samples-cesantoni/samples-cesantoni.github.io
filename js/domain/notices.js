import { rid } from './common.js';
import { AppError, logEvent, getRequest } from './common.js';
import { NOTICE_CATEGORIES, NOTICE_LABEL, CLOSURE_CATEGORIES, FINAL_STATUSES } from './catalog.js';
import { noticeEmail, queueEmail, EMAIL_RE } from './email.js';
import { dateRange, localParts, addDaysIso } from './time.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function closedDates(d, settings) {
  const set = new Set(settings.holidays || []);
  for (const n of d.notices) {
    if (n.status === 'CANCELLED' || !CLOSURE_CATEGORIES.includes(n.category)) continue;
    for (const day of dateRange(n.start, n.end || n.start)) set.add(day);
  }
  return set;
}

function validate(input) {
  const n = {
    category: input.category, start: input.start, end: input.end || input.start, message: String(input.message || '').trim(),
    scope: input.scope, requestNo: input.requestNo || null, filters: { country: input.country || '', deliveryMode: input.deliveryMode || '' },
  };
  if (!NOTICE_CATEGORIES.includes(n.category)) throw new AppError(400, 'INVALID_CATEGORY', 'Select a notice type');
  if (!ISO.test(n.start) || !ISO.test(n.end) || n.end < n.start) throw new AppError(400, 'INVALID_DATES', 'Provide a valid start and end date');
  if (n.message.length < 10) throw new AppError(400, 'MESSAGE_REQUIRED', 'Write the message for the customers (English)');
  if (!['ONE', 'ALL_ACTIVE'].includes(n.scope)) throw new AppError(400, 'INVALID_SCOPE', 'Select One Request or All Active Requests');
  if (n.scope === 'ONE' && !n.requestNo) throw new AppError(400, 'REQUEST_REQUIRED', 'Select the request');
  const r = input.reminder || {};
  n.reminder = { enabled: Boolean(r.enabled), frequencyDays: Math.min(Math.max(Number(r.frequencyDays) || 0, 1), 30), until: r.until || n.end, stopped: false };
  if (n.reminder.enabled && (!ISO.test(n.reminder.until) || n.reminder.until > n.end)) throw new AppError(400, 'INVALID_REMINDER', 'Reminders must end on or before the notice end date');
  n.initialSendDate = input.initialSendDate && ISO.test(input.initialSendDate) ? input.initialSendDate : null;
  return n;
}

function audience(d, n) {
  let pool;
  const excluded = [];
  if (n.scope === 'ONE') {
    const r = getRequest(d, n.requestNo);
    pool = [r];
    if (FINAL_STATUSES.includes(r.status)) excluded.push({ requestNo: r.requestNo, reason: `Status ${r.status}` });
  } else {
    pool = Object.values(d.requests);
    for (const r of pool) {
      if (FINAL_STATUSES.includes(r.status)) excluded.push({ requestNo: r.requestNo, reason: `Status ${r.status}` });
      else if (n.filters.country && r.country !== n.filters.country) excluded.push({ requestNo: r.requestNo, reason: 'Country filter' });
      else if (n.filters.deliveryMode && r.deliveryMode !== n.filters.deliveryMode) excluded.push({ requestNo: r.requestNo, reason: 'Delivery mode filter' });
    }
  }
  const ex = new Set(excluded.map((e) => e.requestNo));
  const groups = new Map();
  for (const r of pool) {
    if (ex.has(r.requestNo)) continue;
    const email = String(r.customer.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { excluded.push({ requestNo: r.requestNo, reason: 'No valid customer email' }); continue; }
    const g = groups.get(email) || { email, customerName: r.customer.fullName, requestNos: [] };
    g.requestNos.push(r.requestNo);
    groups.set(email, g);
  }
  return { recipients: [...groups.values()], excluded };
}

function previewNotice(ctx, input) {
  const d = ctx.store.data;
  const n = validate(input);
  const a = audience(d, n);
  const sample = a.recipients[0];
  const card = noticeEmail({ notice: n, requests: sample ? sample.requestNos : ['SMCES-XXXX'], customerName: sample?.customerName, timeZone: ctx.config.timeZone, logoSrc: '/assets/logo-cesantoni.png' });
  return { notice: n, ...a, email: { subject: card.subject, html: card.html } };
}

function queueRun(ctx, d, notice, runKey) {
  const a = audience(d, notice);
  const ids = [];
  for (const g of a.recipients) {
    const card = noticeEmail({ notice, requests: g.requestNos, customerName: g.customerName, timeZone: ctx.config.timeZone, logoSrc: 'cid:cesantoniLogo' });
    const e = queueEmail(d, { opKey: `notice:${notice.id}:${runKey}:${g.email}`, requestNos: g.requestNos, type: 'OPERATIONAL_NOTICE', to: g.email, noticeId: notice.id, ...card });
    ids.push(e.id);
    for (const no of g.requestNos) if (!notice.requestNos.includes(no)) notice.requestNos.push(no);
  }
  notice.runs.push({ runKey, at: new Date().toISOString(), emails: ids.length });
  return ids;
}

function createNotice(ctx, input, area) {
  const n0 = validate(input);
  return ctx.store.tx((d) => {
    if (input.opKey && d.operations[input.opKey]) return { ...d.operations[input.opKey], replayed: true };
    const today = localParts(new Date(), ctx.config.timeZone).iso;
    const notice = { id: rid('NTC'), ...n0, status: 'ACTIVE', createdAt: new Date().toISOString(), area: 'CESANTONI', requestNos: [], runs: [], notify: Boolean(input.notify) };
    let emailIds = [];
    if (notice.notify) {
      if (!notice.initialSendDate || notice.initialSendDate <= today) {
        emailIds = queueRun(ctx, d, notice, today);
        notice.nextRunDate = notice.reminder.enabled ? addDaysIso(today, notice.reminder.frequencyDays) : null;
      } else notice.nextRunDate = notice.initialSendDate;
    } else {
      // Recorded without emailing: still mark affected requests for reporting / time calculations.
      notice.requestNos = audience(d, notice).recipients.flatMap((g) => g.requestNos);
    }
    d.notices.push(notice);
    for (const no of notice.requestNos) logEvent(d, { requestNo: no, event: `Operational notice registered: ${NOTICE_LABEL[notice.category]}`, area });
    logEvent(d, { event: `Operational notice registered: ${NOTICE_LABEL[notice.category]} (${notice.start} – ${notice.end})`, area });
    const result = { notice, emailIds };
    if (input.opKey) d.operations[input.opKey] = result;
    return result;
  });
}

// Runs on the server scheduler — never depends on a browser being open.
function dueRuns(ctx) {
  const today = localParts(new Date(), ctx.config.timeZone).iso;
  return ctx.store.tx((d) => {
    const ids = [];
    for (const n of d.notices) {
      if (n.status !== 'ACTIVE' || !n.notify || !n.nextRunDate || n.nextRunDate > today) continue;
      const isInitial = n.runs.length === 0;
      if (!isInitial && (!n.reminder.enabled || n.reminder.stopped || today > n.reminder.until)) { n.nextRunDate = null; continue; }
      ids.push(...queueRun(ctx, d, n, today));
      const next = n.reminder.enabled && !n.reminder.stopped ? addDaysIso(today, n.reminder.frequencyDays) : null;
      n.nextRunDate = next && next <= n.reminder.until ? next : null;
    }
    return ids;
  });
}

function stopReminders(d, id, area) {
  const n = d.notices.find((x) => x.id === id);
  if (!n) throw new AppError(404, 'NOTICE_NOT_FOUND', 'Notice not found');
  n.reminder.stopped = true; n.nextRunDate = n.runs.length ? null : n.nextRunDate;
  logEvent(d, { event: `Reminders stopped for notice ${NOTICE_LABEL[n.category]}`, area });
  return { notice: n };
}
function cancelNotice(d, id, area) {
  const n = d.notices.find((x) => x.id === id);
  if (!n) throw new AppError(404, 'NOTICE_NOT_FOUND', 'Notice not found');
  n.status = 'CANCELLED'; n.nextRunDate = null; n.reminder.stopped = true;
  logEvent(d, { event: `Notice cancelled: ${NOTICE_LABEL[n.category]}`, area });
  return { notice: n };
}

export { closedDates, previewNotice, createNotice, dueRuns, stopReminders, cancelNotice, audience };
