import { rid } from './common.js';
import { AppError, logEvent, getRequest, once } from './common.js';
import { EVIDENCE_STAGE, EVIDENCE_LABEL, CARRIERS } from './catalog.js';
import { autoShip } from './status.js';

function addEvidence(d, { requestNo, type, fileId, notes, data, replacesId, eventAt, opKey }, area) {
  return once(d, opKey, () => {
    getRequest(d, requestNo);
    const stage = EVIDENCE_STAGE[type];
    if (!stage) throw new AppError(400, 'INVALID_TYPE', 'Unknown evidence type');
    if (type === 'QUANTITY_CONFIRMATION') {
      if (!data || !Array.isArray(data.lines) || !data.lines.length) throw new AppError(400, 'MISSING_DATA', 'Confirm the quantities per line');
    } else if (!fileId || !d.files[fileId] || d.files[fileId].requestNo !== requestNo) {
      throw new AppError(400, 'MISSING_FILE', 'Attach a photo or PDF for this evidence');
    }
    let replaced = null;
    if (replacesId) {
      replaced = d.evidence.find((e) => e.id === replacesId && e.requestNo === requestNo);
      if (!replaced || replaced.state !== 'RETURNED' || replaced.supersededBy) throw new AppError(409, 'CANNOT_REPLACE', 'Only returned evidence can be replaced');
    }
    const e = {
      id: rid('EVD'), requestNo, stage, type, fileId: fileId || null,
      notes: String(notes || '').slice(0, 1000), data: data || null, eventAt: eventAt || null,
      uploadedAt: new Date().toISOString(), area, state: 'PENDING', review: null, replaces: replacesId || null, supersededBy: null,
    };
    d.evidence.push(e);
    if (replaced) replaced.supersededBy = e.id;
    logEvent(d, { requestNo, event: `${EVIDENCE_LABEL[type]} uploaded${replaced ? ' (correction)' : ''}`, area });
    d.sheetOutbox.push({ kind: 'EVIDENCE_LOG', evidenceId: e.id, at: e.uploadedAt });
    const auto = type === 'SHIPPING_LABEL_PHOTO' ? autoShip(d, requestNo) : null;
    return { evidence: e, autoStatus: auto ? auto.to : null };
  });
}

// CESANTONI review. Approval never changes the official status by itself.
function reviewEvidence(d, { evidenceId, decision, notes }, area) {
  const e = d.evidence.find((x) => x.id === evidenceId);
  if (!e) throw new AppError(404, 'EVIDENCE_NOT_FOUND', 'Evidence not found');
  if (e.supersededBy) throw new AppError(409, 'SUPERSEDED', 'A newer version of this evidence exists');
  if (!['APPROVE', 'RETURN'].includes(decision)) throw new AppError(400, 'INVALID_DECISION', 'Decision must be APPROVE or RETURN');
  if (decision === 'RETURN' && String(notes || '').trim().length < 5) throw new AppError(400, 'NOTES_REQUIRED', 'Explain what must be corrected');
  e.state = decision === 'APPROVE' ? 'APPROVED' : 'RETURNED';
  e.review = { at: new Date().toISOString(), area: 'CESANTONI', notes: String(notes || '').slice(0, 1000) };
  logEvent(d, { requestNo: e.requestNo, event: `Evidence ${decision === 'APPROVE' ? 'approved' : 'returned for correction'} (${EVIDENCE_LABEL[e.type]})`, area });
  return { evidence: e };
}

const TRACKING_RE = /^[A-Z0-9][A-Z0-9-]{5,39}$/;
function trackingUrl(settings, carrier, trackingNo) {
  const c = (settings.carriers || CARRIERS)[carrier];
  return c && c.trackingUrl && trackingNo ? c.trackingUrl.replace('{n}', encodeURIComponent(trackingNo)) : '';
}

function setShipment(d, settings, requestNo, input, area) {
  getRequest(d, requestNo);
  const s = d.shipments[requestNo] || { requestNo };
  const before = JSON.stringify(s);
  if (input.carrier !== undefined) {
    if (input.carrier && !(settings.carriers || CARRIERS)[input.carrier]) throw new AppError(400, 'INVALID_CARRIER', 'Unknown carrier');
    s.carrier = input.carrier || '';
  }
  if (input.trackingNo !== undefined) {
    const t = String(input.trackingNo || '').toUpperCase().replace(/\s+/g, '');
    if (t && !TRACKING_RE.test(t)) throw new AppError(400, 'INVALID_TRACKING', 'Tracking number must be 6–40 letters/digits as printed on the label');
    if (t && !input.trackingConfirmed) throw new AppError(400, 'TRACKING_NOT_CONFIRMED', 'Confirm the tracking number matches the label before saving');
    s.trackingNo = t;
  }
  for (const k of ['shipDate', 'deliveryMethod', 'notes', 'otherCarrierName', 'deliveryNotes']) if (input[k] !== undefined) s[k] = String(input[k] || '').slice(0, 500);
  if (area === 'CESANTONI') {
    if (input.estimatedDate !== undefined) s.estimatedDate = input.estimatedDate || '';
    if (input.estimateConfirmed !== undefined) s.estimateConfirmed = Boolean(input.estimateConfirmed);
  }
  if (input.deliveredAt !== undefined) {
    if (input.deliveredAt && isNaN(new Date(input.deliveredAt))) throw new AppError(400, 'INVALID_DATE', 'Invalid delivery date');
    if (input.deliveredAt && new Date(input.deliveredAt) > new Date(Date.now() + 3600e3)) throw new AppError(400, 'FUTURE_DATE', 'A delivery cannot be recorded in the future');
    s.deliveredAt = input.deliveredAt ? new Date(input.deliveredAt).toISOString() : '';
  }
  if (input.deliveryResult !== undefined) {
    if (input.deliveryResult && !['DELIVERED_OK', 'DELIVERED_WITH_ISSUES', 'NOT_DELIVERED'].includes(input.deliveryResult)) throw new AppError(400, 'INVALID_RESULT', 'Invalid delivery result');
    s.deliveryResult = input.deliveryResult || '';
  }
  s.trackingUrl = trackingUrl(settings, s.carrier, s.trackingNo);
  s.updatedAt = new Date().toISOString();
  d.shipments[requestNo] = s;
  if (before !== JSON.stringify(s)) {
    logEvent(d, { requestNo, event: input.deliveredAt ? 'Delivery details recorded' : 'Carrier / tracking details updated', area });
    d.sheetOutbox.push({ kind: 'OPERATION', requestNo, at: s.updatedAt });
  }
  const auto = s.trackingNo ? autoShip(d, requestNo) : null;
  return { shipment: s, autoStatus: auto ? auto.to : null };
}

export { addEvidence, reviewEvidence, setShipment, trackingUrl, TRACKING_RE };
