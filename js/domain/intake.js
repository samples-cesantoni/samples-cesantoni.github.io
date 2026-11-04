// Requests made by customers in the platform's public form («solicitar/»). The form writes the request under
// its folio (SMCES-0009…) in sc_pedidos; a CESANTONI session turns it into a request here, with the exact
// inventory row of each product (line.ref), and the inventory is deducted on arrival like any other request.
import { rid, logEvent } from './common.js';

const KIND_LABEL = { CUT: '8×8 in Cut Sample', FULL: 'Full Piece', MESH: 'Mesh' };
const s = (v, n = 300) => String(v ?? '').trim().slice(0, n);

function pendingIntake(d) { return Object.values(d.intake || {}).filter((p) => !p.converted || p.nuevo); }

function convertIntake(d) {
  const at = new Date().toISOString();
  const created = [];
  for (const p of pendingIntake(d)) {
    const no = p.requestNo;
    if (!no || d.requests[no]) { p.converted = true; p.nuevo = false; p.convertedAt = at; continue; }
    const createdAt = s(p.createdAt, 40) || at;
    d.requests[no] = {
      requestNo: no, requestId: p.id || no, createdAt, source: 'FORM',
      customer: { fullName: s(p.customer?.fullName), company: s(p.customer?.company), phone: s(p.customer?.phone, 60), email: s(p.customer?.email, 200).toLowerCase() },
      country: s(p.country, 80), state: s(p.state, 80), city: s(p.city, 80), zip: s(p.zip, 20), address: s(p.address, 400), deliveryRefs: s(p.deliveryRefs, 400),
      lines: (p.lines || []).slice(0, 40).map((l, i) => ({
        line: i + 1, model: s(l.model, 80), color: s(l.color, 60), finish: s(l.finish, 60),
        pieceSize: [KIND_LABEL[l.kind] || '', s(l.size, 60)].filter(Boolean).join(' · '), pieces: Math.max(1, Math.min(20, Number(l.pieces) || 1)), sku: '', ref: s(l.ref, 80),
      })),
      status: 'RECEIVED', sourceStatus: 'RECEIVED', deliveryMode: null, statusDates: { RECEIVED: createdAt }, statusChangedAt: createdAt,
      observations: [], sourceNotes: s(p.notes, 1000), syncedAt: at,
    };
    d.statusHistory.push({ id: rid('STH'), requestNo: no, from: null, to: 'RECEIVED', at: createdAt, area: 'SYSTEM', notes: 'Received from the platform request form', exception: null });
    logEvent(d, { requestNo: no, event: 'Request received (platform form)', area: 'SYSTEM', at: createdAt });
    p.converted = true; p.nuevo = false; p.convertedAt = at;
    created.push(no);
  }
  return created;
}

// Highest folio number in use (requests already in the platform), to keep the form's counter ahead of it.
function maxFolio(d) {
  let n = 0;
  for (const no of [...Object.keys(d.requests), ...Object.keys(d.intake || {})]) { const m = /^SMCES-(\d+)$/.exec(no); if (m) n = Math.max(n, Number(m[1])); }
  return n;
}

export { convertIntake, pendingIntake, maxFolio };
