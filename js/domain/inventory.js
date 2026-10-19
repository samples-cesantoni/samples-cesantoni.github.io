import { rid } from './common.js';
import { AppError, logEvent, getRequest, once } from './common.js';
import { norm } from './sheet-parse.js';
import { FINAL_STATUSES } from './catalog.js';

function reservedFor(d, itemId) {
  return d.reservations.filter((r) => r.itemId === itemId && r.state === 'ACTIVE').reduce((s, r) => s + r.qty, 0);
}
function itemView(d, it) {
  const reserved = reservedFor(d, it.itemId);
  const available = it.onHand - reserved;
  const state = available <= 0 ? 'OUT_OF_STOCK' : available < 5 ? 'LOW' : 'AVAILABLE';
  return { ...it, reserved, available, state };
}
function listItems(d) { return Object.values(d.inventory).map((it) => itemView(d, it)); }

// Catalog items that can fulfil a requested line (model + color, preferring the sample type).
function candidates(d, line) {
  const wantCut = /cut/i.test(line.pieceSize || '');
  return listItems(d)
    .filter((it) => norm(it.model) === norm(line.model) && norm(it.color) === norm(line.color))
    .map((it) => ({ ...it, preferred: wantCut ? /CUT/i.test(it.sampleType) : /STANDARD/i.test(it.sampleType) }))
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.available - a.available);
}

function lineAllocation(d, requestNo) {
  const req = d.requests[requestNo];
  return req.lines.map((line) => {
    const res = d.reservations.filter((r) => r.requestNo === requestNo && r.line === line.line && r.state !== 'RELEASED');
    const cands = candidates(d, line);
    const reservedQty = res.reduce((s, r) => s + r.qty, 0);
    const best = cands[0];
    const location = res[0] ? d.inventory[res[0].itemId]?.location : best?.location || '';
    const shortage = reservedQty < line.pieces && !cands.some((c) => c.available >= line.pieces - reservedQty);
    return { ...line, reservations: res, reservedQty, candidates: cands.slice(0, 6), location, shortage };
  });
}

function reserve(d, { requestNo, line, itemId, qty, opKey }, area) {
  return once(d, opKey, () => {
    const req = getRequest(d, requestNo);
    if (FINAL_STATUSES.includes(req.status)) throw new AppError(409, 'REQUEST_CLOSED', 'Request is delivered or cancelled');
    const l = req.lines.find((x) => x.line === Number(line));
    if (!l) throw new AppError(400, 'LINE_NOT_FOUND', 'Requested line not found');
    const it = d.inventory[itemId];
    if (!it) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
    qty = Number(qty);
    if (!Number.isInteger(qty) || qty <= 0) throw new AppError(400, 'INVALID_QTY', 'Quantity must be a positive whole number');
    const already = d.reservations.filter((r) => r.requestNo === requestNo && r.line === l.line && r.state !== 'RELEASED').reduce((s, r) => s + r.qty, 0);
    if (already + qty > l.pieces) throw new AppError(409, 'OVER_RESERVATION', `Line ${l.line} requests ${l.pieces} pieces; ${already} already reserved`);
    const available = it.onHand - reservedFor(d, itemId);
    if (qty > available) throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${available} available at ${it.location || 'its location'}`, { available });
    const r = { id: rid('RSV'), requestNo, line: l.line, itemId, qty, state: 'ACTIVE', createdAt: new Date().toISOString() };
    d.reservations.push(r);
    it.reserved = reservedFor(d, itemId); // touching the item makes concurrent reservations conflict
    d.movements.push({ id: rid('MOV'), at: r.createdAt, type: 'RESERVE', itemId, qty, requestNo, area });
    logEvent(d, { requestNo, event: `Material reserved (line ${l.line}, ${qty} pcs)`, area });
    return { reservation: r };
  });
}

function release(d, { reservationId }, area) {
  const r = d.reservations.find((x) => x.id === reservationId);
  if (!r) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
  if (r.state !== 'ACTIVE') throw new AppError(409, 'RESERVATION_NOT_ACTIVE', 'Only active reservations can be released');
  r.state = 'RELEASED'; r.releasedAt = new Date().toISOString();
  if (d.inventory[r.itemId]) d.inventory[r.itemId].reserved = reservedFor(d, r.itemId);
  d.movements.push({ id: rid('MOV'), at: r.releasedAt, type: 'RELEASE', itemId: r.itemId, qty: r.qty, requestNo: r.requestNo, area });
  logEvent(d, { requestNo: r.requestNo, event: `Reservation released (line ${r.line})`, area });
  return { reservation: r };
}

// Physical exit: converts an active reservation into an issued movement and lowers stock.
function issue(d, { reservationId, opKey }, area) {
  return once(d, opKey, () => {
    const r = d.reservations.find((x) => x.id === reservationId);
    if (!r) throw new AppError(404, 'RESERVATION_NOT_FOUND', 'Reservation not found');
    if (r.state !== 'ACTIVE') throw new AppError(409, 'ALREADY_ISSUED', 'This reservation was already issued or released');
    const it = d.inventory[r.itemId];
    if (it.onHand < r.qty) throw new AppError(409, 'NEGATIVE_STOCK', 'Issuing would leave negative stock');
    it.onHand -= r.qty;
    r.state = 'ISSUED'; r.issuedAt = new Date().toISOString();
    it.reserved = reservedFor(d, r.itemId);
    d.movements.push({ id: rid('MOV'), at: r.issuedAt, type: 'ISSUE', itemId: r.itemId, qty: r.qty, requestNo: r.requestNo, area });
    logEvent(d, { requestNo: r.requestNo, event: `Material issued from warehouse (line ${r.line}, ${r.qty} pcs)`, area });
    return { reservation: r };
  });
}

export { listItems, itemView, candidates, lineAllocation, reserve, release, issue, reservedFor };
