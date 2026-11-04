// Inventory kept 100% by the platform (settings.inventorySource = 'PLATFORM').
// The inventory is the list of warehouse rows (d.physicalInventory): one product at one cabinet/position or
// reference, with model, color, finish, sample size, kind (20×20 cut / full piece) and quantity. Requests made
// in the platform's own form name the exact row (line.ref); they are deducted when they arrive and given back if
// cancelled. The public catalog of the form is derived from these rows, so a change here changes the form.
import { rid, AppError, logEvent } from './common.js';
import { norm } from './sheet-parse.js';

const platformMode = (d) => (d.settings || {}).inventorySource === 'PLATFORM';
const kindOf = (x) => { const v = norm(x); return /MESH|MALLA/.test(v) ? 'MESH' : /STANDARD|FULL|COMPLETA/.test(v) ? 'FULL' : /CUT|SAMPLE|CORTE|8×8|8X8|20×20|20X20/.test(v) ? 'CUT' : ''; };
const rowKind = (r) => (r.cut20 ? 'CUT' : r.fullPiece ? 'FULL' : kindOf(r.sampleSize));
const rowLabel = (r) => (r.cabinet && r.position ? `Mueble ${r.cabinet} · Pos. ${r.position}` : r.ref || r.reference || '');
const tokens = (x) => norm(x).split(/[^A-Z0-9ÁÉÍÓÚÑ]+/).filter((t) => t && !/^\d+(\.\d+)?$/.test(t));

// Every row gets a stable id: its reference, its cabinet-position, or a new one.
function ensureRefs(d) {
  const seen = new Set();
  d.physicalInventory = (d.physicalInventory || []).map((r) => {
    let ref = r.ref || r.reference || (r.cabinet && r.position ? `${String(r.cabinet).toUpperCase()}-${r.position}` : '');
    while (!ref || seen.has(ref)) ref = rid('INV');
    seen.add(ref);
    return r.ref === ref ? r : { ...r, ref };
  });
  return d.physicalInventory;
}
const rowByRef = (d, ref) => (d.physicalInventory || []).find((r) => r.ref === ref) || null;
function setRow(d, ref, patch) { d.physicalInventory = d.physicalInventory.map((r) => (r.ref === ref ? { ...r, ...patch } : r)); return rowByRef(d, ref); }

// Requests that did not come from the platform's form (no line.ref): the row whose words and kind match.
function matchRow(d, line, pieces = 1) {
  const lt = new Set([...tokens(line.model), ...tokens(line.color)]);
  const want = kindOf(line.pieceSize);
  return (d.physicalInventory || []).filter((r) => r.active !== false && (r.quantity || 0) > 0)
    .filter((r) => { const rt = [...tokens(r.model), ...tokens(r.color)]; return rt.length && rt.every((t) => lt.has(t)) && (!want || !rowKind(r) || rowKind(r) === want); })
    .sort((a, b) => Number(b.quantity >= pieces) - Number(a.quantity >= pieces) || b.quantity - a.quantity)[0] || null;
}

function deductRow(d, requestNo, line, row, at) {
  const qty = Math.min(line.pieces, row.quantity || 0);
  if (qty <= 0) return null;
  const n = d.movements.filter((m) => m.source === 'AUTO' && m.type === 'ISSUE' && m.requestNo === requestNo && m.line === line.line).length + 1;
  const before = row.quantity;
  setRow(d, row.ref, { quantity: before - qty });
  const m = { id: `MOV-AUTO-${requestNo}-L${line.line}-${n}`, at, type: 'ISSUE', source: 'AUTO', rowRef: row.ref, itemId: null, qty, requestNo, line: line.line, area: 'SYSTEM',
    model: row.model, color: row.color, sampleType: row.sampleSize, location: rowLabel(row), before, after: before - qty,
    note: qty < line.pieces ? `Deducted on arrival — only ${qty} of ${line.pieces} in stock` : 'Deducted on arrival' };
  d.movements.push(m);
  return m;
}
function returnToRow(d, m) {
  const row = m.rowRef && rowByRef(d, m.rowRef);
  if (!row) return null;
  const before = row.quantity || 0;
  setRow(d, row.ref, { quantity: before + m.qty });
  return { before, after: before + m.qty };
}

// What the customer form offers: active rows, without quantities (only whether there is stock).
function publicCatalog(d) {
  return (d.physicalInventory || []).filter((r) => r.active !== false && r.ref).map((r) => ({
    ref: r.ref, model: r.model, color: r.color || '', finish: r.finish || '', size: r.sampleSize || '', kind: rowKind(r), available: (r.quantity || 0) > 0,
  })).sort((a, b) => a.model.localeCompare(b.model) || a.color.localeCompare(b.color) || a.size.localeCompare(b.size));
}

// Switch: from now on the platform keeps the stock. The deductions already made (by the base) stay as they are.
function startPlatform(d) {
  if (platformMode(d)) return;
  d.settings = { ...(d.settings || {}), inventorySource: 'PLATFORM', platformFrom: new Date().toISOString() };
  ensureRefs(d);
}

// ---------------------------------------------------------------- Excel: compare and apply
const fields = ['model', 'color', 'finish', 'sampleSize', 'cut20', 'fullPiece', 'cabinet', 'position'];
const productKey = (r) => [r.model, r.color, r.finish, r.sampleSize, rowKind(r)].map(norm).join('|');
function pairExcel(d, rows) {
  const current = d.physicalInventory || [];
  const used = new Set();
  const pick = (pred) => { const i = current.findIndex((c, j) => !used.has(j) && pred(c)); if (i >= 0) used.add(i); return i >= 0 ? current[i] : null; };
  const pairs = rows.map((x) => {
    const loc = x.cabinet && x.position ? `${norm(x.cabinet)}|${Number(x.position)}` : '';
    const row = (x.ref && pick((c) => norm(c.ref) === norm(x.ref) || norm(c.reference) === norm(x.ref)))
      || (loc && pick((c) => c.cabinet && `${norm(c.cabinet)}|${Number(c.position)}` === loc && tokens(c.model)[0] === tokens(x.model)[0]))
      || pick((c) => productKey(c) === productKey(x));
    return { x, row };
  });
  const missing = current.filter((c, j) => !used.has(j) && c.active !== false);
  return { pairs, missing };
}
function diffExcel(d, rows) {
  ensureRefs(d);
  const { pairs, missing } = pairExcel(d, rows);
  const out = { added: [], changed: [], same: 0, missing: missing.map((r) => ({ ref: r.ref, model: r.model, color: r.color, size: r.sampleSize, quantity: r.quantity })) };
  for (const { x, row } of pairs) {
    if (!row) { out.added.push({ model: x.model, color: x.color, size: x.sampleSize, quantity: x.qty }); continue; }
    const qtyChange = (row.quantity ?? 0) !== x.qty;
    const dataChange = fields.some((k) => x[k] !== undefined && x[k] !== '' && String(x[k]) !== String(row[k] ?? '')) || (x.active === false) !== (row.active === false);
    if (qtyChange || dataChange) out.changed.push({ ref: row.ref, model: row.model, color: row.color, size: row.sampleSize, before: row.quantity ?? 0, after: x.qty });
    else out.same += 1;
  }
  return out;
}
// The Excel is the physical count: quantities become exactly the Excel's. New rows are added; rows not in the
// Excel are deactivated only if asked (never deleted). Every quantity change is a movement.
function applyExcel(d, rows, { name, deactivateMissing = false }, area) {
  startPlatform(d);
  const at = new Date().toISOString();
  const { pairs, missing } = pairExcel(d, rows);
  const mv = (row, before, after, note) => { if (before !== after) d.movements.push({ id: rid('MOV'), at, type: after > before ? 'RECEIPT' : 'ADJUST', source: 'EXCEL', rowRef: row.ref, itemId: null, qty: Math.abs(after - before), requestNo: null, area, model: row.model, color: row.color, sampleType: row.sampleSize, location: rowLabel(row), before, after, note }); };
  let added = 0, changed = 0;
  for (const { x, row } of pairs) {
    const data = {};
    for (const k of fields) if (x[k] !== undefined && x[k] !== '') data[k] = x[k];
    if (x.active === false) data.active = false; else if (row && row.active === false) data.active = true;
    if (!row) {
      const ref = x.ref || (x.cabinet && x.position ? `${String(x.cabinet).toUpperCase()}-${x.position}` : rid('INV'));
      const nr = { ref, ...data, quantity: x.qty, active: x.active !== false };
      d.physicalInventory = [...d.physicalInventory, nr];
      mv(nr, 0, x.qty, `Added from ${name}`); added += 1; continue;
    }
    const before = row.quantity ?? 0;
    const updated = setRow(d, row.ref, { ...data, quantity: x.qty });
    if (before !== x.qty || JSON.stringify(updated) !== JSON.stringify(row)) changed += 1;
    mv(updated, before, x.qty, `Inventory update (${name})`);
  }
  if (deactivateMissing) for (const r of missing) setRow(d, r.ref, { active: false });
  ensureRefs(d);
  logEvent(d, { event: `Inventory updated from ${name}: ${added} added, ${changed} changed${deactivateMissing && missing.length ? `, ${missing.length} deactivated` : ''}`, area });
  return { added, changed, deactivated: deactivateMissing ? missing.length : 0, rows: rows.length };
}

// One row edited in the platform (or a new one). Quantity changes need a reason and are recorded.
function saveRow(d, input, area) {
  startPlatform(d);
  const at = new Date().toISOString();
  const q = Number(input.quantity);
  if (!Number.isInteger(q) || q < 0) throw new AppError(400, 'INVALID_QTY', 'La existencia debe ser un número entero, cero o más');
  if (!String(input.model || '').trim()) throw new AppError(400, 'MODEL_REQUIRED', 'Escribe el modelo');
  const data = {
    model: String(input.model).trim().toUpperCase(), color: String(input.color || '').trim().toUpperCase(), finish: String(input.finish || '').trim().toUpperCase(),
    sampleSize: String(input.sampleSize || '').trim(), cut20: Boolean(input.cut20), fullPiece: Boolean(input.fullPiece),
    cabinet: String(input.cabinet || '').trim().toUpperCase(), position: String(input.position || '').trim(), active: input.active !== false,
  };
  const row = input.ref ? rowByRef(d, input.ref) : null;
  const before = row ? row.quantity ?? 0 : 0;
  if (before !== q && String(input.reason || '').trim().length < 3) throw new AppError(400, 'REASON_REQUIRED', 'Escribe el motivo del cambio de existencia (por ejemplo: llegaron muestras, conteo físico)');
  let saved;
  if (row) saved = setRow(d, row.ref, { ...data, quantity: q });
  else {
    const ref = data.cabinet && data.position ? `${data.cabinet}-${data.position}` : rid('INV');
    saved = { ref: rowByRef(d, ref) ? rid('INV') : ref, ...data, quantity: q };
    d.physicalInventory = [...(d.physicalInventory || []), saved];
  }
  if (before !== q) d.movements.push({ id: rid('MOV'), at, type: q > before ? 'RECEIPT' : 'ADJUST', source: 'EDIT', rowRef: saved.ref, itemId: null, qty: Math.abs(q - before), requestNo: null, area, model: saved.model, color: saved.color, sampleType: saved.sampleSize, location: rowLabel(saved), before, after: q, note: String(input.reason || (row ? '' : 'New product')).trim().slice(0, 300) });
  return { row: saved };
}

export { platformMode, kindOf, rowKind, rowLabel, ensureRefs, rowByRef, matchRow, deductRow, returnToRow, publicCatalog, startPlatform, diffExcel, applyExcel, saveRow };
