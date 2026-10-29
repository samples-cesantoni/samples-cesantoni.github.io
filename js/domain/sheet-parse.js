// Parsers for the existing Google Sheets structures. They locate header rows by name
// (never by fixed position) and refuse to proceed when required headers are missing,
// so a structural change in the source base is detected instead of silently misread.
import { sha1 } from './sha1.js';
import { naiveToInstant, serialToInstant } from './time.js';

function norm(s) { return String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' '); }

// The base was translated to Spanish: every column is accepted by its English or Spanish name.
const ALIASES = {
  'DATE/TIME': ['FECHA / HORA'], 'REQUEST NO.': ['FOLIO'], LINE: ['LÍNEA'], 'TOTAL LINES': ['TOTAL LÍNEAS'], 'FULL NAME': ['NOMBRE COMPLETO'],
  COMPANY: ['EMPRESA'], PHONE: ['TELÉFONO'], EMAIL: ['CORREO'], COUNTRY: ['PAÍS'], 'STATE/PROVINCE': ['ESTADO / PROVINCIA'], CITY: ['CIUDAD'],
  'ZIP CODE': ['CÓDIGO POSTAL'], ADDRESS: ['DIRECCIÓN'], 'DELIVERY REFERENCES': ['REFERENCIAS DE ENTREGA'], MODEL: ['MODELO'],
  'PIECE SIZE': ['TAMAÑO / TIPO DE MUESTRA'], 'NUMBER OF PIECES': ['NÚM. DE PIEZAS'], STATUS: ['ESTATUS (CÓDIGO)', 'ESTATUS'], NOTES: ['NOTAS'],
  'REQUEST ID': ['ID SOLICITUD'], 'PREPARATION DATE': ['FECHA PREPARACIÓN'], 'SHIP DATE': ['FECHA ENVÍO'], 'DELIVERY DATE': ['FECHA ENTREGA'],
  'TRACKING NO.': ['NÚM. GUÍA / TRACKING'], CARRIER: ['PAQUETERÍA'], DISPLAY: ['MOSTRAR'], 'SKU (OMITTED)': ['SKU (OMITIDO)'],
  'SOURCE FORMAT': ['FORMATO ORIGEN'], 'SAMPLE TYPE': ['TIPO DE MUESTRA'], INVENTORY: ['INVENTARIO'], REFERENCE: ['REFERENCIA'],
  'FORM LABEL': ['ETIQUETA WEB (INGLÉS)', 'ETIQUETA WEB'], '20×20 CUT': ['CORTE 20×20', 'MUESTRA / CUT'], STANDARD: ['PIEZA COMPLETA'], 'BACKUP MUEBLE / POSICIÓN': ['RESPALDO MUEBLE / POSICIÓN', 'RESPALDO'],
  'MUEBLE / POSICIÓN': ['UBICACIÓN'],
};
const names = (h) => [h, ...(ALIASES[h] || [])].map(norm);

function findHeader(rows, required, { from = 0, maxScan = 15, optional = [] } = {}) {
  for (let r = 0; r < Math.min(rows.length, maxScan); r++) {
    const row = (rows[r] || []).map(norm);
    const pos = (h) => { for (const n of names(h)) { const i = row.indexOf(n, from); if (i >= 0) return i; } return -1; };
    const idx = {};
    let ok = true;
    for (const h of required) { const i = pos(h); if (i < 0) { ok = false; break; } idx[h] = i; }
    if (ok) {
      for (const h of [...optional, ...Object.keys(ALIASES)]) if (idx[h] === undefined) { const i = pos(h); if (i >= 0) idx[h] = i; }
      row.forEach((h, i) => { if (h && idx[h] === undefined && i >= from) idx[h] = i; });
      return { headerRow: r, idx };
    }
  }
  return null;
}

function toInstant(v, timeZone) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return naiveToInstant(v, timeZone).toISOString();
  if (typeof v === 'number') return serialToInstant(v, timeZone).toISOString();
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return naiveToInstant(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])), timeZone).toISOString();
  const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dm) return naiveToInstant(new Date(Date.UTC(+dm[3], +dm[2] - 1, +dm[1], dm[4] ? +dm[4] : 12, dm[5] ? +dm[5] : 0)), timeZone).toISOString();
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}
const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

const REQUEST_HEADERS = ['DATE/TIME', 'REQUEST NO.', 'LINE', 'FULL NAME', 'COMPANY', 'EMAIL', 'COUNTRY', 'ADDRESS', 'MODEL', 'COLOR', 'PIECE SIZE', 'NUMBER OF PIECES', 'STATUS', 'REQUEST ID'];

// "REQUESTS" sheet of Base Sample Request: one row per requested product line.
function parseRequests(rows, timeZone) {
  const h = findHeader(rows, REQUEST_HEADERS);
  if (!h) throw new Error('REQUESTS sheet: expected headers not found (structure changed?)');
  const g = (row, k) => (h.idx[k] === undefined ? '' : row[h.idx[k]]);
  const byNo = new Map();
  for (const row of rows.slice(h.headerRow + 1)) {
    const no = str(g(row, 'REQUEST NO.'));
    if (!/^[A-Z]+-\d+$/.test(no)) continue;
    let r = byNo.get(no);
    if (!r) {
      r = {
        requestNo: no,
        requestId: str(g(row, 'REQUEST ID')) || null,
        createdAt: toInstant(g(row, 'DATE/TIME'), timeZone),
        customer: { fullName: str(g(row, 'FULL NAME')), company: str(g(row, 'COMPANY')), phone: str(g(row, 'PHONE')), email: str(g(row, 'EMAIL')) },
        country: str(g(row, 'COUNTRY')), state: str(g(row, 'STATE/PROVINCE')), city: str(g(row, 'CITY')),
        zip: str(g(row, 'ZIP CODE')), address: str(g(row, 'ADDRESS')), deliveryRefs: str(g(row, 'DELIVERY REFERENCES')),
        sourceStatus: str(g(row, 'STATUS')) || 'RECEIVED', sourceNotes: str(g(row, 'NOTES')),
        lines: [],
      };
      byNo.set(no, r);
    }
    r.lines.push({
      line: num(g(row, 'LINE')) ?? r.lines.length + 1,
      model: str(g(row, 'MODEL')), color: /^\d+(\.\d+)?$/.test(str(g(row, 'COLOR'))) ? '' : str(g(row, 'COLOR')), pieceSize: str(g(row, 'PIECE SIZE')), // a stray number in COLOR is not a color
      pieces: num(g(row, 'NUMBER OF PIECES')) ?? 0, sku: str(g(row, 'SKU')),
    });
  }
  return [...byNo.values()];
}

// "TRACKING" sheet: one row per request with operational dates.
function parseTracking(rows, timeZone) {
  const h = findHeader(rows, ['REQUEST NO.', 'STATUS']);
  if (!h) return [];
  const g = (row, k) => (h.idx[k] === undefined ? '' : row[h.idx[k]]);
  return rows.slice(h.headerRow + 1).filter((r) => /^[A-Z]+-\d+$/.test(str(g(r, 'REQUEST NO.')))).map((row) => ({
    requestNo: str(g(row, 'REQUEST NO.')), status: str(g(row, 'STATUS')),
    preparationDate: toInstant(g(row, 'PREPARATION DATE'), timeZone), shipDate: toInstant(g(row, 'SHIP DATE'), timeZone),
    deliveryDate: toInstant(g(row, 'DELIVERY DATE'), timeZone), trackingNo: cleanTracking(g(row, 'TRACKING NO.')), notes: str(g(row, 'NOTES')),
  }));
}
// Only values shaped like a real tracking number (the base sometimes holds placeholders such as "1").
function cleanTracking(v) { const t = str(v).toUpperCase().replace(/\s+/g, ''); return /^[A-Z0-9][A-Z0-9-]{5,39}$/.test(t) ? t : ''; }

// "OPERATION DATA" sheet: carrier and tracking per request.
function parseOperation(rows) {
  const h = findHeader(rows, ['REQUEST NO.', 'CARRIER']);
  if (!h) return [];
  const g = (row, k) => (h.idx[k] === undefined ? '' : row[h.idx[k]]);
  return rows.slice(h.headerRow + 1).filter((r) => /^[A-Z]+-\d+$/.test(str(g(r, 'REQUEST NO.')))).map((row) => ({
    requestNo: str(g(row, 'REQUEST NO.')), carrier: str(g(row, 'CARRIER')).toUpperCase(), trackingNo: cleanTracking(g(row, 'TRACKING NO.')),
  }));
}

// "MOVIMIENTOS INVENTARIO": stock deductions the base applies per request (the platform never deducts again).
function parseInventoryMoves(rows, timeZone) {
  const h = findHeader(rows, ['FOLIO', 'MODELO', 'CANTIDAD']);
  if (!h) return [];
  const g = (row, k) => (h.idx[k] === undefined ? '' : row[h.idx[k]]);
  return rows.slice(h.headerRow + 1).filter((r) => /^[A-Z]+-\d+$/.test(str(g(r, 'FOLIO'))) && str(g(r, 'MODELO')) && num(g(r, 'CANTIDAD')) > 0).map((row) => {
    const m = {
      at: toInstant(g(row, 'FECHA'), timeZone), requestNo: str(g(row, 'FOLIO')), model: str(g(row, 'MODELO')), color: str(g(row, 'COLOR')),
      sampleType: str(g(row, 'TIPO DESCONTADO')) || str(g(row, 'TIPO')), qty: num(g(row, 'CANTIDAD')) ?? 0, location: str(g(row, 'UBICACIÓN')) || str(g(row, 'REFERENCIA')),
      before: num(g(row, 'INVENTARIO ANTERIOR')), after: num(g(row, 'INVENTARIO NUEVO')), note: str(g(row, 'NOTA')),
    };
    m.id = 'MOV-SRC-' + sha1([m.requestNo, m.model, m.color, m.sampleType, m.qty, m.location, m.before, m.after].map(norm).join('|')).slice(0, 16);
    return m;
  });
}

function itemId(parts) {
  return 'ITM-' + sha1(parts.map(norm).join('|')).slice(0, 12);
}

// "PRODUCTS" sheet: A:M catalog of the web form + the warehouse inventory block on the right.
// Two layouts are accepted: the original one (FORMATO ORIGEN, MUEBLE / POSICIÓN, physical MUEBLE + POSICIÓN) and the
// official Houston one (TAMAÑO DE MUESTRA, REFERENCIA FUENTE, physical block keyed by REFERENCIA «HOUSTON2-001»).
function parseCatalog(rows) {
  const h = findHeader(rows, ['MODEL', 'COLOR', 'SAMPLE TYPE', 'INVENTORY']);
  if (!h) throw new Error('PRODUCTS sheet: catalog headers not found (structure changed?)');
  const items = [];
  const seen = new Map();
  const end = Math.max(...['MODEL', 'COLOR', 'SAMPLE TYPE', 'INVENTORY', 'MUEBLE / POSICIÓN', 'BACKUP MUEBLE / POSICIÓN', 'REFERENCIA FUENTE', 'STANDARD'].map((k) => h.idx[k] ?? -1));
  const fmtCol = h.idx['SOURCE FORMAT'] ?? (h.idx['TAMAÑO DE MUESTRA'] !== undefined && h.idx['TAMAÑO DE MUESTRA'] < end ? h.idx['TAMAÑO DE MUESTRA'] : undefined);
  for (const row of rows.slice(h.headerRow + 1)) {
    const g = (k) => (h.idx[k] === undefined || h.idx[k] > end ? '' : row[h.idx[k]]);
    const model = str(g('MODEL'));
    if (!model) continue;
    const color = /^\d+(\.\d+)?$/.test(str(g('COLOR'))) ? '' : str(g('COLOR'));
    const format = fmtCol === undefined ? '' : str(row[fmtCol]);
    const reference = str(g('REFERENCIA FUENTE'));
    const base = [model, color, format, str(g('SAMPLE TYPE'))];
    const n = (seen.get(base.join('|')) || 0) + 1; seen.set(base.join('|'), n);
    items.push({
      itemId: reference ? `ITM-${reference}` : itemId([model, str(g('COLOR')), format, str(g('SAMPLE TYPE')), n > 1 ? n : '']),
      sku: str(g('SKU (OMITTED)')) || str(g('SKU')), reference,
      model, color, format, sampleType: str(g('SAMPLE TYPE')),
      formLabel: str(g('FORM LABEL')), onHand: num(g('INVENTORY')) ?? 0,
      location: str(g('MUEBLE / POSICIÓN')) || reference, backupLocation: str(g('BACKUP MUEBLE / POSICIÓN')),
      display: g('DISPLAY') === true || norm(g('DISPLAY')) === 'TRUE',
    });
  }
  const physical = [];
  const yes = (v) => v === true || /^(TRUE|SI|SÍ|YES|X)$/i.test(str(v));
  const p = findHeader(rows, ['MUEBLE', 'POSICIÓN', 'MODELO', 'INVENTARIO'], { from: end + 1 });
  const o = p ? null : findHeader(rows, ['REFERENCIA', 'MODELO', 'INVENTARIO'], { from: end + 1 });
  const b = p || o;
  if (b) {
    for (const row of rows.slice(b.headerRow + 1)) {
      const g = (k) => (b.idx[k] === undefined || b.idx[k] <= end ? '' : row[b.idx[k]]);
      if (!str(g('MODELO'))) continue;
      physical.push({
        cabinet: str(g('MUEBLE')), position: str(g('POSICIÓN')), reference: str(g('REFERENCIA')), sourceRow: num(g('FILA EXCEL')),
        model: str(g('MODELO')), color: /^\d+(\.\d+)?$/.test(str(g('COLOR'))) ? '' : str(g('COLOR')),
        finish: str(g('ACABADO')), quantity: num(g('INVENTARIO')), sampleSize: str(g('TAMAÑO DE MUESTRA')),
        cut20: yes(g('MUESTRA / CUT')) || yes(g('CORTE 20×20')), fullPiece: yes(g('STANDARD')) || yes(g('PIEZA COMPLETA')),
        backupLocation: str(g('BACKUP MUEBLE / POSICIÓN')), status: str(g('STATUS')) || str(g('ESTATUS')),
      });
    }
  }
  return { items, physical, official: Boolean(o) };
}

export { findHeader, parseRequests, parseTracking, parseOperation, parseInventoryMoves, parseCatalog, toInstant, norm, cleanTracking };
