import { rid } from './common.js';
// Customer email cards (always English) + queue with idempotency. A message is SENT only
// after the provider confirms it; otherwise it stays QUEUED (with the reason) or FAILED.
import { AppError, logEvent, emailIdFor } from './common.js';
import { STATUS_LABEL, NOTICE_LABEL, CARRIERS } from './catalog.js';
import { fmtLocal } from './time.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

const STATUS_MESSAGE = {
  RECEIVED: 'We have received your sample request and it is now in our queue.',
  PREPARING: 'Our logistics team is preparing your samples.',
  PREPARED: 'Your samples have been prepared and are ready for dispatch.',
  READY_FOR_PICKUP: 'Your samples are ready for pickup at our warehouse.',
  SHIPPED: 'Your samples have been shipped.',
  IN_TRANSIT: 'Your samples are in transit with the carrier.',
  DELIVERED: 'Your samples have been delivered.',
  ON_HOLD: 'Your sample request is temporarily on hold.',
  CANCELLED: 'Your sample request has been cancelled.',
};

function shell({ logoSrc, title, rows, body, footerDate }) {
  return `<!doctype html><html><body style="margin:0;padding:24px 0;background:#F7F7F5;font-family:Montserrat,Figtree,Arial,Helvetica,sans-serif;color:#202324">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E4E2DD;border-radius:12px;overflow:hidden">
<tr><td style="padding:28px 32px 18px;border-bottom:4px solid #C5532E" align="left"><img src="${logoSrc}" alt="CESANTONI" width="180" style="display:block;width:180px;height:auto;border:0"></td></tr>
<tr><td style="padding:26px 32px 4px"><div style="font-size:12px;letter-spacing:2px;color:#C5532E;font-weight:700;text-transform:uppercase">Sample Request Update</div>
<h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#191D20">${esc(title)}</h1></td></tr>
<tr><td style="padding:16px 32px 4px;font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:12px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECEAE5;border-radius:8px">${rows}</table></td></tr>
<tr><td style="padding:22px 32px 28px;font-size:14px;line-height:1.6;color:#4A4F52">Kind regards,<br><strong style="color:#191D20">CESANTONI Logistics</strong><br>Sample Requests Team</td></tr>
<tr><td style="padding:14px 32px;background:#191D20;color:#B9BDBF;font-size:11px;line-height:1.5">CESANTONI · Porcelanato Premium<br>Notice date: ${esc(footerDate)} · This is an automated message regarding your sample request.</td></tr>
</table></td></tr></table></body></html>`;
}
const row = (k, v, html = false) => `<tr><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:12px;color:#6B7174;text-transform:uppercase;letter-spacing:1px;width:40%">${esc(k)}</td><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:14px;font-weight:600;color:#191D20">${html ? v : esc(v)}</td></tr>`;

function statusEmail({ req, status, shipment, observations, timeZone, logoSrc, carriers = CARRIERS }) {
  const ship = shipment || {};
  const showShipping = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(status) && ship.trackingNo;
  let rows = row('Request number', req.requestNo) + row('Current status', STATUS_LABEL[status]);
  if (showShipping) {
    rows += row('Carrier', ship.carrier === 'OTHER' ? (ship.otherCarrierName || 'Carrier') : (carriers[ship.carrier]?.name || ship.carrier || '—'));
    rows += row('Tracking number', ship.trackingNo);
    if (ship.trackingUrl) rows += row('Tracking', `<a href="${esc(ship.trackingUrl)}" style="color:#C5532E;font-weight:700">TRACK YOUR SHIPMENT</a>`, true);
    if (ship.estimatedDate && ship.estimateConfirmed && status !== 'DELIVERED') rows += row('Estimated delivery (carrier-confirmed)', ship.estimatedDate);
  }
  const greeting = req.customer.fullName ? `Dear ${esc(req.customer.fullName)},` : 'Dear Customer,';
  let body = `<p style="margin:0 0 10px">${greeting}</p><p style="margin:0 0 10px">${esc(STATUS_MESSAGE[status])}</p>`;
  if (observations) body += `<p style="margin:0 0 10px;padding:12px 14px;background:#FBF3EF;border-left:3px solid #C5532E;border-radius:4px"><strong>Observations:</strong> ${esc(observations)}</p>`;
  const date = fmtLocal(new Date(), timeZone, false);
  const subject = `CESANTONI sample request ${req.requestNo} — ${STATUS_LABEL[status]}`;
  const text = [greeting.replace(/<[^>]+>/g, ''), STATUS_MESSAGE[status], `Request number: ${req.requestNo}`, `Current status: ${STATUS_LABEL[status]}`,
    showShipping ? `Carrier: ${carriers[ship.carrier]?.name || ship.carrier}\nTracking number: ${ship.trackingNo}${ship.trackingUrl ? `\nTrack: ${ship.trackingUrl}` : ''}` : '',
    observations ? `Observations: ${observations}` : '', 'Kind regards,\nCESANTONI Logistics — Sample Requests Team', `Notice date: ${date}`].filter(Boolean).join('\n\n');
  return { subject, html: shell({ logoSrc, title: `Request ${req.requestNo}: ${STATUS_LABEL[status]}`, rows, body, footerDate: date }), text };
}

function noticeEmail({ notice, requests, customerName, timeZone, logoSrc }) {
  const date = fmtLocal(new Date(), timeZone, false);
  const period = notice.start === notice.end || !notice.end ? notice.start : `${notice.start} to ${notice.end}`;
  let rows = row('Notice type', NOTICE_LABEL[notice.category]) + row('Period', period) + row(requests.length > 1 ? 'Affected requests' : 'Request number', requests.join(', '));
  const greeting = customerName ? `Dear ${esc(customerName)},` : 'Dear Customer,';
  const body = `<p style="margin:0 0 10px">${greeting}</p><p style="margin:0 0 10px;white-space:pre-line">${esc(notice.message)}</p>`;
  const subject = `CESANTONI operational notice — ${NOTICE_LABEL[notice.category]}`;
  const text = `${greeting.replace(/<[^>]+>/g, '')}\n\n${notice.message}\n\nNotice type: ${NOTICE_LABEL[notice.category]}\nPeriod: ${period}\nRequests: ${requests.join(', ')}\n\nKind regards,\nCESANTONI Logistics — Sample Requests Team\nNotice date: ${date}`;
  return { subject, html: shell({ logoSrc, title: NOTICE_LABEL[notice.category], rows, body, footerDate: date }), text };
}

function queueEmail(d, { opKey, requestNos, type, to, subject, html, text, noticeId }) {
  if (opKey) {
    const existing = d.emails.find((e) => e.opKey === opKey);
    if (existing) return existing;
  }
  if (!EMAIL_RE.test(String(to || ''))) throw new AppError(400, 'INVALID_RECIPIENT', 'The request has no valid customer email address');
  const e = {
    id: opKey ? emailIdFor(opKey) : rid('EML'), opKey: opKey || null, requestNos, type, to, subject, html, text,
    noticeId: noticeId || null, status: 'QUEUED', statusReason: '', attempts: 0, providerId: null, error: '',
    createdAt: new Date().toISOString(), sentAt: null, deliveredTo: null,
  };
  d.emails.push(e);
  return e;
}

// Sends through the configured provider. Must be called outside store.tx (it is async)
// and writes the outcome back in a separate transaction.
async function dispatch(ctx, emailId) {
  const { store, config, logoBase64 } = ctx;
  const e = store.data.emails.find((x) => x.id === emailId);
  if (!e || e.status === 'SENT') return e;
  const p = config.email;
  let recipient = e.to;
  const block = (reason) => store.tx(() => { e.status = 'QUEUED'; e.statusReason = reason; });
  if (p.mode !== 'PRODUCTION') {
    if (!p.testRecipient) { block('TEST mode: no TEST_EMAIL_RECIPIENT configured — not sent'); return e; }
    recipient = p.testRecipient;
  }
  if (p.provider === 'NONE') { block('Demo mode: no email provider connected — not sent'); return e; }
  if (p.provider !== 'APPS_SCRIPT' || !p.appsScriptUrl || !p.appsScriptSecret) { block('Email provider not fully configured — not sent'); return e; }
  store.tx(() => { e.attempts += 1; e.status = 'SENDING'; });
  try {
    const res = await fetch(p.appsScriptUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow',
      body: JSON.stringify({
        secret: p.appsScriptSecret, idempotencyKey: e.id, to: recipient, subject: p.mode === 'PRODUCTION' ? e.subject : `[TEST] ${e.subject}`,
        htmlBody: e.html, body: e.text, name: p.fromName, inlineImages: { cesantoniLogo: { base64: logoBase64, mimeType: 'image/png' } },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok !== true) throw new Error(json.error || `Provider responded HTTP ${res.status}`);
    store.tx((d) => {
      e.status = 'SENT'; e.statusReason = ''; e.error = ''; e.sentAt = new Date().toISOString(); e.providerId = json.id || null; e.deliveredTo = p.mode === 'PRODUCTION' ? 'CUSTOMER' : 'TEST_RECIPIENT';
      for (const no of e.requestNos) logEvent(d, { requestNo: no, event: `Customer notification sent${p.mode === 'PRODUCTION' ? '' : ' (test recipient)'}`, area: 'SYSTEM' });
      d.sheetOutbox.push({ kind: 'EMAIL_LOG', emailId: e.id, at: e.sentAt });
    });
  } catch (err) {
    store.tx((d) => {
      e.status = 'FAILED'; e.error = String(err.message || err).slice(0, 300);
      for (const no of e.requestNos) logEvent(d, { requestNo: no, event: 'Customer notification failed', area: 'SYSTEM' });
      d.sheetOutbox.push({ kind: 'EMAIL_LOG', emailId: e.id, at: new Date().toISOString() });
    });
  }
  return e;
}

export { statusEmail, noticeEmail, queueEmail, dispatch, EMAIL_RE, esc };
