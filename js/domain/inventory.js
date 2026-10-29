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

// Per requested line: what was deducted (by the old Sample Request base, or by the platform when the
// request arrived), where it came from, matching catalog items and whether there is a shortage.
const lineKey = (model, color) => norm(`${model || ''} ${color || ''}`);
function lineAllocation(d, requestNo) {
  const req = d.requests[requestNo];
  const act = activeDeductions(d).filter((m) => m.requestNo === requestNo);
  return req.lines.map((line) => {
    const deductions = act.filter((m) => ofLine(m, line));
    const excludedLine = (req.excludedLines || []).includes(line.line);
    const deductedQty = deductions.reduce((s, m) => s + (m.qty || 0), 0);
    const cands = candidates(d, line);
    const location = deductions[0]?.location || cands[0]?.location || '';
    const shortage = deductedQty < line.pieces && !cands.some((c) => c.available >= line.pieces - deductedQty);
    return { ...line, deductions, deductedQty, excludedLine, reservations: [], reservedQty: deductedQty, candidates: cands.slice(0, 6), location, shortage: shortage && !excludedLine && !req.inventoryExcluded };
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

// ---------------------------------------------------------------- the platform keeps the inventory
// Stock is deducted when the request arrives, line by line, from the catalog item of the same model and
// color (preferring the sample type: cut vs full piece) and its physical location. The switch date is kept in
// settings.inventoryFrom (set once, the first time this runs): older requests were deducted by the Sample
// Request base and are never deducted again. Cancelled or excluded requests give their pieces back.
const AUTO_NOTE = 'Automatic deduction on request arrival';
function returnedIds(d) { return new Set(d.movements.filter((m) => m.type === 'RETURN' && m.ref).map((m) => m.ref)); }
function activeAuto(d) {
  const returned = returnedIds(d);
  return d.movements.filter((m) => m.source === 'AUTO' && m.type === 'ISSUE' && !returned.has(m.id));
}
// Deductions in force: the base's (before the switch) and the platform's, minus what was given back.
function activeDeductions(d) {
  const returned = returnedIds(d);
  return d.movements.filter((m) => (m.source === 'AUTO' || m.source === 'BASE') && m.type === 'ISSUE' && !returned.has(m.id));
}
// AUTO movements carry the line; the base's are matched by model + color.
const ofLine = (m, line) => (m.source === 'AUTO' ? m.line === line.line : lineKey(m.model, m.color) === lineKey(line.model, line.color) || (norm(m.model) === norm(line.model) && !line.color));
const cutover = (d) => (d.settings && d.settings.inventoryFrom) || null;
function startPlatformInventory(d) {
  if (!cutover(d)) d.settings = { ...(d.settings || {}), inventoryFrom: new Date().toISOString() };
  return cutover(d);
}
const parseLoc = (loc) => { const m = String(loc || '').match(/mueble\s*([A-Z0-9]+)\s*·?\s*pos\.?\s*([0-9.]+)/i); return m ? { cabinet: m[1].toUpperCase(), position: m[2] } : null; };
// A cabinet + position holds one product, so the physical row is found by its location.
const locKey = (cabinet, position) => `${String(cabinet).toUpperCase()}|${Number(position)}`;
// Some positions appear twice in the base (two products at one cabinet/position): then the model decides.
const sameProduct = (a, b) => { const x = norm(a), y = norm(b); return Boolean(x && y) && (x.startsWith(y) || y.startsWith(x)); };
function physicalAt(d, location, model) {
  const p = parseLoc(location);
  if (!p || !Array.isArray(d.physicalInventory)) return null;
  const rows = d.physicalInventory.filter((x) => locKey(x.cabinet, x.position) === locKey(p.cabinet, p.position));
  return rows.length > 1 && model ? rows.find((x) => sameProduct(x.model, model)) || rows[0] : rows[0] || null;
}
function touchPhysical(d, item, delta) {
  const row = physicalAt(d, item.location, item.model);
  if (row && typeof row.quantity === 'number') { d.physicalInventory = d.physicalInventory.map((x) => (x === row ? { ...x, quantity: Math.max(0, x.quantity + delta) } : x)); }
}
function pendingInventory(d) {
  const c = cutover(d);
  const act = activeAuto(d);
  const out = { deduct: [], giveBack: [] };
  if (!c) return out;
  const all = activeDeductions(d);
  for (const req of Object.values(d.requests)) {
    if (req.status === 'CANCELLED' || req.inventoryExcluded) { if (all.some((m) => m.requestNo === req.requestNo)) out.giveBack.push(req.requestNo); continue; }
    if (!(String(req.createdAt || '') >= c)) continue;
    const mine = act.filter((m) => m.requestNo === req.requestNo);
    for (const line of req.lines || []) {
      if (!(line.pieces > 0) || (req.excludedLines || []).includes(line.line) || mine.some((m) => m.line === line.line)) continue;
      const cands = candidates(d, line).filter((i) => i.onHand > 0);
      if (cands.length) out.deduct.push({ requestNo: req.requestNo, line });
    }
  }
  return out;
}
function returnMove(d, m, why, at) {
  const it = d.inventory[m.itemId];
  const before = it ? it.onHand : null;
  if (it) it.onHand += m.qty;
  const row = physicalAt(d, m.location || (it && it.location), m.model);
  if (row && typeof row.quantity === 'number') d.physicalInventory = d.physicalInventory.map((x) => (x === row ? { ...x, quantity: x.quantity + m.qty } : x));
  d.movements.push({ id: `MOV-RET-${m.id.replace(/^MOV-/, '')}`, ref: m.id, at, type: 'RETURN', source: 'AUTO', itemId: m.itemId, qty: m.qty, requestNo: m.requestNo, line: m.line, area: 'SYSTEM',
    model: m.model, color: m.color, sampleType: m.sampleType, location: m.location, before, after: it ? it.onHand : null, note: why });
}
function giveBack(d, requestNo, why, at = new Date().toISOString()) {
  for (const m of activeDeductions(d).filter((x) => x.requestNo === requestNo)) returnMove(d, m, why, at);
  logEvent(d, { requestNo, event: `Inventory returned (${why})`, area: 'SYSTEM', at });
}
function deductLine(d, requestNo, line, at) {
  const pick = candidates(d, line).filter((i) => i.onHand > 0).sort((a, b) => Number(b.preferred) - Number(a.preferred) || Number(b.onHand >= line.pieces) - Number(a.onHand >= line.pieces) || b.onHand - a.onHand)[0];
  if (!pick) return false;
  const it = d.inventory[pick.itemId];
  const qty = Math.min(line.pieces, it.onHand);
  const n = d.movements.filter((m) => m.source === 'AUTO' && m.type === 'ISSUE' && m.requestNo === requestNo && m.line === line.line).length + 1;
  const before = it.onHand;
  it.onHand -= qty;
  touchPhysical(d, it, -qty);
  d.movements.push({ id: `MOV-AUTO-${requestNo}-L${line.line}-${n}`, at, type: 'ISSUE', source: 'AUTO', itemId: it.itemId, qty, requestNo, line: line.line, area: 'SYSTEM',
    model: it.model, color: it.color, sampleType: it.sampleType, location: it.location, before, after: it.onHand,
    note: qty < line.pieces ? `${AUTO_NOTE} — only ${qty} of ${line.pieces} in stock` : AUTO_NOTE });
  return true;
}
function reconcileInventory(d) {
  startPlatformInventory(d);
  const { deduct, giveBack: back } = pendingInventory(d);
  const at = new Date().toISOString();
  for (const no of back) giveBack(d, no, d.requests[no].inventoryExcluded ? 'Request excluded from inventory' : 'Request cancelled', at);
  const touched = new Set();
  for (const { requestNo, line } of deduct) if (deductLine(d, requestNo, line, at)) touched.add(requestNo);
  for (const no of touched) logEvent(d, { requestNo: no, event: 'Inventory deducted automatically on request arrival', area: 'SYSTEM', at });
  return { deducted: deduct.length, returned: back.length };
}
const needsReconcile = (d) => { if (!cutover(d)) return true; const p = pendingInventory(d); return p.deduct.length + p.giveBack.length > 0; };

// CESANTONI: stock received or counted. Records the difference as a movement (never deletes history).
function adjustStock(d, { itemId, newQty, reason }, area) {
  const it = d.inventory[itemId];
  if (!it) throw new AppError(404, 'ITEM_NOT_FOUND', 'Inventory item not found');
  const q = Number(newQty);
  if (!Number.isInteger(q) || q < 0) throw new AppError(400, 'INVALID_QTY', 'Quantity must be a whole number, zero or more');
  if (String(reason || '').trim().length < 3) throw new AppError(400, 'REASON_REQUIRED', 'Write the reason (e.g. samples received, physical count)');
  const delta = q - it.onHand;
  if (!delta) return { item: it };
  const before = it.onHand;
  it.onHand = q;
  touchPhysical(d, it, delta);
  d.movements.push({ id: rid('MOV'), at: new Date().toISOString(), type: delta > 0 ? 'RECEIPT' : 'ADJUST', itemId, qty: Math.abs(delta), requestNo: null, area,
    model: it.model, color: it.color, sampleType: it.sampleType, location: it.location, before, after: q, note: String(reason).trim().slice(0, 300) });
  return { item: it };
}

// CESANTONI: physical count of one cabinet/position. The catalog items stored there follow it.
function adjustPhysical(d, { cabinet, position, model, newQty, reason }, area) {
  const q = Number(newQty);
  if (!Number.isInteger(q) || q < 0) throw new AppError(400, 'INVALID_QTY', 'Quantity must be a whole number, zero or more');
  if (String(reason || '').trim().length < 3) throw new AppError(400, 'REASON_REQUIRED', 'Write the reason (e.g. samples received, physical count)');
  const row = physicalAt(d, `Mueble ${cabinet} · Pos. ${position}`, model);
  if (!row) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Location not found in the physical inventory');
  const before = row.quantity ?? 0;
  if (q === before) return { row };
  const at = new Date().toISOString();
  const items = Object.values(d.inventory).filter((it) => physicalAt(d, it.location, it.model) === row);
  d.physicalInventory = d.physicalInventory.map((x) => (x === row ? { ...x, quantity: q } : x));
  const location = `Mueble ${row.cabinet} · Pos. ${row.position}`;
  for (const it of items) it.onHand = q;
  d.movements.push({ id: rid('MOV'), at, type: q > before ? 'RECEIPT' : 'ADJUST', itemId: items[0] ? items[0].itemId : null, qty: Math.abs(q - before), requestNo: null, area,
    model: row.model, color: row.color, sampleType: row.sampleSize, location, before, after: q, note: String(reason).trim().slice(0, 300) });
  return { row: { ...row, quantity: q } };
}

// CESANTONI: a whole request, or some of its lines, is not deducted (e.g. full pieces that were not sent).
// Excluding gives the pieces back at once (also those the base deducted); including again deducts them.
function setInventoryExclusion(d, requestNo, excluded) {
  const req = getRequest(d, requestNo);
  const at = new Date().toISOString();
  req.inventoryExcluded = Boolean(excluded);
  if (excluded) giveBack(d, requestNo, 'Request excluded from inventory', at);
  else for (const line of req.lines || []) includeLine(d, req, line, at);
  logEvent(d, { requestNo, event: excluded ? 'Request excluded from inventory deduction' : 'Request included again in inventory deduction', area: 'CESANTONI' });
  return { request: req };
}
function includeLine(d, req, line, at) {
  if ((req.excludedLines || []).includes(line.line) || !(line.pieces > 0)) return;
  if (activeDeductions(d).some((m) => m.requestNo === req.requestNo && ofLine(m, line))) return;
  deductLine(d, req.requestNo, line, at);
}
function setLineExclusion(d, requestNo, lineNo, excluded) {
  const req = getRequest(d, requestNo);
  const line = (req.lines || []).find((l) => l.line === Number(lineNo));
  if (!line) throw new AppError(400, 'LINE_NOT_FOUND', 'Requested line not found');
  const at = new Date().toISOString();
  const set = new Set(req.excludedLines || []);
  if (excluded) set.add(line.line); else set.delete(line.line);
  req.excludedLines = [...set].sort((a, b) => a - b);
  if (excluded) for (const m of activeDeductions(d).filter((x) => x.requestNo === requestNo && ofLine(x, line))) returnMove(d, m, `Line ${line.line} excluded from inventory`, at);
  else if (!req.inventoryExcluded) includeLine(d, req, line, at);
  logEvent(d, { requestNo, event: `Line ${line.line} ${excluded ? 'excluded from' : 'included again in'} inventory deduction`, area: 'CESANTONI', at });
  return { request: req };
}

// CESANTONI: initial physical inventory (Excel «Inventario inicial»: MODELO, COLOR, ACABADO, TAMAÑO DE MUESTRA, INVENTARIO,
// one row per cabinet/position in the same order as the physical inventory). Every position is left at
// initial − deductions in force at that location; catalog items follow the quantity of their location.
function applyInitialInventory(d, rows, name) {
  startPlatformInventory(d);
  const at = new Date().toISOString();
  const phys = d.physicalInventory || [];
  const used = new Set();
  const same = (r, x) => norm(r.model) === norm(x.model) && norm(r.finish) === norm(x.finish) && norm(r.sampleSize).replace(/\s/g, '') === norm(x.sampleSize).replace(/\s/g, '');
  const pairs = []; const unmatched = [];
  rows.forEach((r, i) => {
    let x = phys[i] && !used.has(i) && norm(phys[i].model) === norm(r.model) ? i : -1;
    if (x < 0) x = phys.findIndex((p, j) => !used.has(j) && same(r, p) && (!r.color || norm(p.color) === norm(r.color)));
    if (x < 0) { unmatched.push(`${r.model} ${r.color || ''} ${r.sampleSize || ''}`.trim()); return; }
    used.add(x); pairs.push([r, x]);
  });
  const ded = new Map();
  for (const m of activeDeductions(d)) { const row = physicalAt(d, m.location, m.model); if (row) ded.set(row, (ded.get(row) || 0) + (m.qty || 0)); }
  d.physicalInventory = phys.map((p, j) => {
    const pr = pairs.find(([, x]) => x === j);
    if (!pr) return p;
    const r = pr[0]; // the Excel is the reference: its names replace the base's
    return { ...p, model: r.model, color: r.color, finish: r.finish || p.finish, sampleSize: r.sampleSize || p.sampleSize, cut20: r.cut20, fullPiece: r.fullPiece,
      initialQuantity: r.qty, quantity: Math.max(0, r.qty - (ded.get(p) || 0)) };
  });
  let itemsChanged = 0;
  for (const it of Object.values(d.inventory)) {
    const row = physicalAt(d, it.location, it.model);
    const q = row && row.initialQuantity !== undefined ? row.quantity : undefined;
    if (q === undefined || q === it.onHand) continue;
    d.movements.push({ id: rid('MOV'), at, type: q > it.onHand ? 'RECEIPT' : 'ADJUST', source: 'INITIAL', itemId: it.itemId, qty: Math.abs(q - it.onHand), requestNo: null, area: 'CESANTONI',
      model: it.model, color: it.color, sampleType: it.sampleType, location: it.location, before: it.onHand, after: q, note: `Initial inventory (${name}) minus requests deducted` });
    it.onHand = q; itemsChanged += 1;
  }
  return { rows: rows.length, matched: pairs.length, unmatched, itemsChanged };
}

export { listItems, itemView, candidates, lineAllocation, reserve, release, issue, reservedFor, reconcileInventory, needsReconcile, adjustStock, setInventoryExclusion, setLineExclusion, applyInitialInventory, adjustPhysical, physicalAt, activeAuto, activeDeductions, touchPhysical, cutover as inventoryFrom };
