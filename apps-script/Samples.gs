/**
 * Samples CESANTONI · tareas en el servidor (Google Apps Script)
 *
 *  1. sincronizar()   cada 15 min: lee «Base Sample Request CESANTONI - English» (solo lectura) y crea en Firestore
 *                     las solicitudes nuevas (sc_solicitudes) con su folio original, el catálogo y el inventario físico.
 *  2. recordatorios() cada hora: envía los recordatorios programados de los avisos operativos (sc_avisos).
 *  4. rastreo()       cada 15 min: estatus de UPS (Track API si hay credenciales, y avisos de UPS que llegan a este Gmail),
 *                     cambios automáticos In Transit / Delivered y correo de cada cambio automático.
 *  3. volcarSalida()  cada 30 min: copia historial, evidencias, correos y operación a «Base Sample Evidence & Costs»
 *                     (agrega filas; antes verifica los encabezados). Apagado hasta que CONFIG.ESCRIBIR_EN_BASE sea true.
 *
 * Instalación: ver LEEME.md › «Apps Script». Corre con la cuenta dueña del proyecto de Firebase; por eso no pasa
 * por las reglas de Firestore. Nunca escribe en la base de solicitudes original.
 */
var CONFIG = {
  PROYECTO: 'proveedores-cesantoni',
  FUENTE_ID: '1kaU7C0vRooahl4HaNZu_lS36dOKojlVQ5dqvtlpviDo',     // Base Sample Request CESANTONI - English (solo lectura)
  EVIDENCIAS_ID: '16Z1XSRdmbQjowxBxmQ3LTIJGEqNh-93x1YSF3Za8gaY',  // Base Sample Evidence & Costs CESANTONI - English
  ESCRIBIR_EN_BASE: false,
  SITIO: 'https://samples-cesantoni.github.io/',
  ZONA: 'America/Mexico_City',
  FIRESTORE: '' // vacío = https://firestore.googleapis.com/v1 (las pruebas usan el emulador)
};

/* ------------------------------------------------------------------ instalación */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('recordatorios').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('volcarSalida').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('rastreo').timeBased().everyMinutes(15).create();
  sincronizar();
}

/* ------------------------------------------------------------------ Firestore REST */
function fsBase() { return (CONFIG.FIRESTORE || 'https://firestore.googleapis.com/v1') + '/projects/' + CONFIG.PROYECTO + '/databases/(default)/documents'; }
function fsCall(method, path, body) {
  var r = UrlFetchApp.fetch(fsBase() + path, {
    method: method, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: body ? JSON.stringify(body) : undefined
  });
  var code = r.getResponseCode(), txt = r.getContentText();
  if (code === 404 || code === 409) return { status: code };
  if (code >= 300) throw new Error('Firestore ' + code + ': ' + txt.slice(0, 300));
  return { status: code, json: txt ? JSON.parse(txt) : {} };
}
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  var f = {}; Object.keys(v).forEach(function (k) { if (v[k] !== undefined) f[k] = enc(v[k]); });
  return { mapValue: { fields: f } };
}
function dec(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { var o = {}, f = v.mapValue.fields || {}; Object.keys(f).forEach(function (k) { o[k] = dec(f[k]); }); return o; }
  return null;
}
function fields(obj) { return enc(obj).mapValue.fields; }
function docData(doc) { var o = dec({ mapValue: { fields: doc.fields || {} } }); o.__name = doc.name; o.__time = doc.updateTime; return o; }
function fsGet(col, id) { var r = fsCall('get', '/' + col + '/' + encodeURIComponent(id)); return r.status === 404 ? null : docData(r.json); }
// Crea solo si no existe (409 = ya existe): así dos procesos nunca duplican un registro.
function fsCreate(col, id, data) { data._v = 1; data._u = Date.now(); return fsCall('post', '/' + col + '?documentId=' + encodeURIComponent(id), { fields: fields(data) }).status !== 409; }
// Reemplaza con control de versión: falla si alguien lo modificó desde que se leyó (o si se creó mientras tanto).
function fsReplace(col, id, data, prev) {
  data._v = (prev && prev._v ? prev._v : 0) + 1; data._u = Date.now();
  delete data.__name; delete data.__time; delete data.__id;
  var raiz = fsBase().replace(/^https?:\/\/[^/]+\/v1\//, '');
  var write = { update: { name: raiz + '/' + col + '/' + id, fields: fields(data) }, currentDocument: prev ? { updateTime: prev.__time } : { exists: false } };
  var r = UrlFetchApp.fetch(fsBase().replace(/\/documents$/, '/documents:commit'), { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify({ writes: [write] }) });
  if (r.getResponseCode() >= 300) throw new Error('Firestore ' + r.getResponseCode() + ' al guardar ' + col + '/' + id + ': ' + r.getContentText().slice(0, 200));
}
function fsList(col) {
  var out = [], token = '';
  do {
    var r = fsCall('get', '/' + col + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    (r.json && r.json.documents || []).forEach(function (d) { var x = docData(d); x.__id = d.name.split('/').pop(); out.push(x); });
    token = r.json && r.json.nextPageToken;
  } while (token);
  return out;
}
function fsDelete(col, id) { fsCall('delete', '/' + col + '/' + encodeURIComponent(id)); }

/* ------------------------------------------------------------------ utilidades */
function hex(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }
function sha1(s) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, s, Utilities.Charset.UTF_8)); }
function rid(p) { return p + '-' + Date.now().toString(36) + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function hoy() { return Utilities.formatDate(new Date(), CONFIG.ZONA, 'yyyy-MM-dd'); }
function sumarDias(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function norm(s) { return String(s === null || s === undefined ? '' : s).trim().toUpperCase().replace(/\s+/g, ' '); }
function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function num(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v); }
function instante(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? null : v.toISOString();
  var s = String(v).trim(), m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) { // dd/mm/aaaa como la escribe la base, hora local de México (mediodía si no trae hora)
    var guess = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0));
    var off = Number(Utilities.formatDate(guess, CONFIG.ZONA, 'Z')) ; var h = Math.trunc(off / 100), mi = off % 100;
    return new Date(guess.getTime() - (h * 60 + mi) * 60000).toISOString();
  }
  var d = new Date(s); return isNaN(d) ? null : d.toISOString();
}
function guia(v) { var t = str(v).toUpperCase().replace(/\s+/g, ''); return /^[A-Z0-9][A-Z0-9-]{5,39}$/.test(t) ? t : ''; }
function diaLocal(iso) { return iso ? Utilities.formatDate(new Date(iso), CONFIG.ZONA, 'yyyy-MM-dd') : ''; }

/* ------------------------------------------------------------------ lectura de la base original (mismos criterios que la plataforma) */
// La base se tradujo al español: cada columna se acepta con su nombre en inglés o en español.
var ALIAS = {
  'DATE/TIME': ['FECHA / HORA'], 'REQUEST NO.': ['FOLIO'], 'LINE': ['LÍNEA'], 'FULL NAME': ['NOMBRE COMPLETO'], 'COMPANY': ['EMPRESA'], 'PHONE': ['TELÉFONO'],
  'EMAIL': ['CORREO'], 'COUNTRY': ['PAÍS'], 'STATE/PROVINCE': ['ESTADO / PROVINCIA'], 'CITY': ['CIUDAD'], 'ZIP CODE': ['CÓDIGO POSTAL'], 'ADDRESS': ['DIRECCIÓN'],
  'DELIVERY REFERENCES': ['REFERENCIAS DE ENTREGA'], 'MODEL': ['MODELO'], 'PIECE SIZE': ['TAMAÑO / TIPO DE MUESTRA'], 'NUMBER OF PIECES': ['NÚM. DE PIEZAS'],
  'STATUS': ['ESTATUS (CÓDIGO)', 'ESTATUS'], 'NOTES': ['NOTAS'], 'REQUEST ID': ['ID SOLICITUD'], 'PREPARATION DATE': ['FECHA PREPARACIÓN'], 'SHIP DATE': ['FECHA ENVÍO'],
  'DELIVERY DATE': ['FECHA ENTREGA'], 'TRACKING NO.': ['NÚM. GUÍA / TRACKING'], 'CARRIER': ['PAQUETERÍA'], 'DISPLAY': ['MOSTRAR'], 'SKU (OMITTED)': ['SKU (OMITIDO)'],
  'SOURCE FORMAT': ['FORMATO ORIGEN'], 'SAMPLE TYPE': ['TIPO DE MUESTRA'], 'INVENTORY': ['INVENTARIO'], 'FORM LABEL': ['ETIQUETA WEB (INGLÉS)'],
  'BACKUP MUEBLE / POSICIÓN': ['RESPALDO MUEBLE / POSICIÓN']
};
function nombres(h) { return [h].concat(ALIAS[h] || []).map(norm); }
function encabezado(rows, req, desde) {
  desde = desde || 0;
  for (var r = 0; r < Math.min(rows.length, 15); r++) {
    var row = rows[r].map(norm), idx = {}, ok = true;
    var pos = function (h) { var n = nombres(h); for (var k = 0; k < n.length; k++) { var p = row.indexOf(n[k], desde); if (p >= 0) return p; } return -1; };
    for (var i = 0; i < req.length; i++) { var p = pos(req[i]); if (p < 0) { ok = false; break; } idx[req[i]] = p; }
    if (ok) {
      Object.keys(ALIAS).forEach(function (h) { if (idx[h] === undefined) { var q = pos(h); if (q >= 0) idx[h] = q; } });
      row.forEach(function (h, j) { if (h && idx[h] === undefined && j >= desde) idx[h] = j; });
      return { fila: r, idx: idx };
    }
  }
  return null;
}
function leerSolicitudes(rows) {
  var h = encabezado(rows, ['DATE/TIME', 'REQUEST NO.', 'LINE', 'FULL NAME', 'COMPANY', 'EMAIL', 'COUNTRY', 'ADDRESS', 'MODEL', 'COLOR', 'PIECE SIZE', 'NUMBER OF PIECES', 'STATUS', 'REQUEST ID']);
  if (!h) throw new Error('SOLICITUDES: no se encontraron los encabezados esperados (¿cambió la estructura?)');
  var g = function (row, k) { return h.idx[k] === undefined ? '' : row[h.idx[k]]; }, porFolio = {}, orden = [];
  rows.slice(h.fila + 1).forEach(function (row) {
    var no = str(g(row, 'REQUEST NO.'));
    if (!/^[A-Z]+-\d+$/.test(no)) return;
    var r = porFolio[no];
    if (!r) {
      r = porFolio[no] = { requestNo: no, requestId: str(g(row, 'REQUEST ID')) || null, createdAt: instante(g(row, 'DATE/TIME')),
        customer: { fullName: str(g(row, 'FULL NAME')), company: str(g(row, 'COMPANY')), phone: str(g(row, 'PHONE')), email: str(g(row, 'EMAIL')) },
        country: str(g(row, 'COUNTRY')), state: str(g(row, 'STATE/PROVINCE')), city: str(g(row, 'CITY')), zip: str(g(row, 'ZIP CODE')),
        address: str(g(row, 'ADDRESS')), deliveryRefs: str(g(row, 'DELIVERY REFERENCES')), sourceStatus: str(g(row, 'STATUS')) || 'RECEIVED',
        sourceNotes: str(g(row, 'NOTES')), lines: [] };
      orden.push(no);
    }
    r.lines.push({ line: num(g(row, 'LINE')) || r.lines.length + 1, model: str(g(row, 'MODEL')), color: str(g(row, 'COLOR')), pieceSize: str(g(row, 'PIECE SIZE')), pieces: num(g(row, 'NUMBER OF PIECES')) || 0, sku: str(g(row, 'SKU')) });
  });
  return orden.map(function (k) { return porFolio[k]; });
}
function leerSeguimiento(rows) {
  var h = encabezado(rows, ['REQUEST NO.', 'STATUS']); if (!h) return {};
  var g = function (row, k) { return h.idx[k] === undefined ? '' : row[h.idx[k]]; }, out = {};
  rows.slice(h.fila + 1).forEach(function (row) {
    var no = str(g(row, 'REQUEST NO.'));
    if (/^[A-Z]+-\d+$/.test(no)) out[no] = { status: str(g(row, 'STATUS')), preparationDate: instante(g(row, 'PREPARATION DATE')), shipDate: instante(g(row, 'SHIP DATE')), deliveryDate: instante(g(row, 'DELIVERY DATE')), trackingNo: guia(g(row, 'TRACKING NO.')), notes: str(g(row, 'NOTES')) };
  });
  return out;
}
function leerOperacion(rows) {
  var h = encabezado(rows, ['REQUEST NO.', 'CARRIER']); if (!h) return {};
  var out = {};
  rows.slice(h.fila + 1).forEach(function (row) { var no = str(row[h.idx['REQUEST NO.']]); if (/^[A-Z]+-\d+$/.test(no)) out[no] = { carrier: str(row[h.idx['CARRIER']]).toUpperCase(), trackingNo: h.idx['TRACKING NO.'] === undefined ? '' : guia(row[h.idx['TRACKING NO.']]) }; });
  return out;
}
// Descuentos de inventario que aplica la base por folio (la plataforma nunca descuenta otra vez).
function leerMovimientos(rows) {
  var h = encabezado(rows, ['FECHA', 'FOLIO', 'MODELO', 'CANTIDAD']); if (!h) return [];
  var g = function (row, k) { return h.idx[k] === undefined ? '' : row[h.idx[k]]; };
  return rows.slice(h.fila + 1).filter(function (r) { return /^[A-Z]+-\d+$/.test(str(g(r, 'FOLIO'))) && str(g(r, 'MODELO')) && num(g(r, 'CANTIDAD')) > 0; }).map(function (row) {
    var m = { at: instante(g(row, 'FECHA')), requestNo: str(g(row, 'FOLIO')), model: str(g(row, 'MODELO')), color: str(g(row, 'COLOR')), sampleType: str(g(row, 'TIPO DESCONTADO')),
      qty: num(g(row, 'CANTIDAD')) || 0, location: str(g(row, 'UBICACIÓN')), before: num(g(row, 'INVENTARIO ANTERIOR')), after: num(g(row, 'INVENTARIO NUEVO')), note: str(g(row, 'NOTA')) };
    m.id = 'MOV-SRC-' + sha1([m.requestNo, m.model, m.color, m.sampleType, m.qty, m.location, m.before, m.after].map(norm).join('|')).slice(0, 16);
    return m;
  });
}
function leerCatalogo(rows) {
  var h = encabezado(rows, ['DISPLAY', 'MODEL', 'COLOR', 'SOURCE FORMAT', 'SAMPLE TYPE', 'INVENTORY', 'MUEBLE / POSICIÓN']);
  if (!h) throw new Error('PRODUCTOS: no se encontraron los encabezados del catálogo');
  var items = [], vistos = {};
  rows.slice(h.fila + 1).forEach(function (row) {
    var g = function (k) { return h.idx[k] === undefined ? '' : row[h.idx[k]]; };
    var model = str(g('MODEL')); if (!model) return;
    var base = [model, str(g('COLOR')), str(g('SOURCE FORMAT')), str(g('SAMPLE TYPE'))], clave = base.join('|');
    var n = (vistos[clave] || 0) + 1; vistos[clave] = n;
    items.push({ itemId: 'ITM-' + sha1(base.concat([n > 1 ? n : '']).map(norm).join('|')).slice(0, 12), sku: str(g('SKU (OMITTED)')) || str(g('SKU')),
      model: model, color: str(g('COLOR')), format: str(g('SOURCE FORMAT')), sampleType: str(g('SAMPLE TYPE')), formLabel: str(g('FORM LABEL')),
      onHand: num(g('INVENTORY')) || 0, location: str(g('MUEBLE / POSICIÓN')), backupLocation: str(g('BACKUP MUEBLE / POSICIÓN')), display: g('DISPLAY') === true || norm(g('DISPLAY')) === 'TRUE' });
  });
  var desde = Math.max(h.idx['MUEBLE / POSICIÓN'] || 0, h.idx['BACKUP MUEBLE / POSICIÓN'] || 0) + 1;
  var p = encabezado(rows, ['MUEBLE', 'POSICIÓN', 'MODELO', 'INVENTARIO'], desde), fisico = [];
  if (p) rows.slice(p.fila + 1).forEach(function (row) {
    var g = function (k) { return p.idx[k] === undefined ? '' : row[p.idx[k]]; };
    if (!str(g('MODELO'))) return;
    fisico.push({ cabinet: str(g('MUEBLE')), position: str(g('POSICIÓN')), model: str(g('MODELO')), color: str(g('COLOR')), finish: str(g('ACABADO')), quantity: num(g('INVENTARIO')), sampleSize: str(g('TAMAÑO DE MUESTRA')), backupLocation: str(g('BACKUP MUEBLE / POSICIÓN')), status: str(g('STATUS')) || str(g('ESTATUS')) });
  });
  return { items: items, fisico: fisico };
}

/* ------------------------------------------------------------------ 1. sincronización */
var ESTATUS = ['RECEIVED', 'PREPARING', 'PREPARED', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'ON_HOLD', 'CANCELLED'];
var FECHA_DE = { PREPARED: 'preparationDate', SHIPPED: 'shipDate', DELIVERED: 'deliveryDate' };
var PAQ = ['FEDEX', 'UPS', 'DHL', 'USPS', 'ESTAFETA', 'PAQUETEXPRESS'];
function estatusValido(s) { s = String(s || '').toUpperCase(); return ESTATUS.indexOf(s) >= 0 ? s : null; }
function nuevoEvento(no, texto, at) { var e = rid('EVT'); fsCreate('sc_eventos', e, { id: e, at: at, requestNo: no, event: texto, area: 'System' }); }

function sincronizar() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(CONFIG.FUENTE_ID);
    var hoja = function (n, opcional) { var sh = ss.getSheetByName(n); if (!sh) { if (opcional) return null; throw new Error('No existe la hoja ' + n); } return sh.getDataRange().getValues(); };
    var solicitudes = leerSolicitudes(hoja('REQUESTS')), seguimiento = leerSeguimiento(hoja('TRACKING')), cat = leerCatalogo(hoja('PRODUCTS'));
    var opV = hoja('OPERATION DATA', true), mvV = hoja('MOVIMIENTOS INVENTARIO', true);
    var operacion = opV ? leerOperacion(opV) : {}, movimientos = mvV ? leerMovimientos(mvV) : [];
    var meta = fsGet('sc_config', 'meta') || {}, hashes = meta.hashes || {}, res = { creadas: 0, actualizadas: 0, estatus: 0, conflictos: 0, articulos: 0, existencias: 0, descuentos: 0 };
    var ahora = new Date().toISOString(), fuente = 'Google Sheets: Base Sample Request CESANTONI - English';
    solicitudes.forEach(function (r) {
      var t = seguimiento[r.requestNo] || {}, op = operacion[r.requestNo] || {};
      var h = sha1(JSON.stringify([r, t, op])); if (hashes[r.requestNo] === h) return;
      var email = r.customer.email; delete r.customer.email;
      var notas = [r.sourceNotes, t.notes].filter(function (x, i, a) { return x && a.indexOf(x) === i; }).join(' · ');
      var estado = estatusValido(t.status) || estatusValido(r.sourceStatus) || 'RECEIVED';
      var campos = { requestId: r.requestId, createdAt: r.createdAt, customer: r.customer, country: r.country, state: r.state, city: r.city, zip: r.zip, address: r.address, deliveryRefs: r.deliveryRefs, lines: r.lines, sourceNotes: notas };
      var previa = fsGet('sc_solicitudes', r.requestNo), doc;
      if (previa && previa.requestId && r.requestId && previa.requestId !== r.requestId) {
        res.conflictos++;
        var c = rid('SYN'); fsCreate('sc_sync', c, { id: c, at: ahora, requestNo: r.requestNo, action: 'CONFLICT', detail: 'Same request number with a different REQUEST ID — not overwritten', source: fuente });
        return;
      }
      if (!previa) {
        doc = Object.assign({ requestNo: r.requestNo }, campos, { status: estado, sourceStatus: estado, deliveryMode: null, statusDates: { RECEIVED: r.createdAt || ahora }, statusChangedAt: r.createdAt || ahora, observations: [], syncedAt: ahora, source: fuente });
      } else {
        doc = previa; Object.keys(campos).forEach(function (k) { doc[k] = campos[k]; }); doc.syncedAt = ahora;
        if (doc.sourceStatus !== estado) { // la base cambió el estatus: se aplica y queda en el historial
          if (doc.status !== estado) {
            var de = doc.status; doc.status = estado; doc.statusChangedAt = ahora;
            var hid = rid('STH'); fsCreate('sc_historial', hid, { id: hid, requestNo: r.requestNo, from: de, to: estado, at: ahora, area: 'SYSTEM', notes: 'Updated from Sample Request base', exception: null });
            nuevoEvento(r.requestNo, 'Status updated from Sample Request base: ' + de + ' → ' + estado, ahora); res.estatus++;
          }
          doc.sourceStatus = estado;
        }
      }
      doc.statusDates = doc.statusDates || {};
      Object.keys(FECHA_DE).forEach(function (st) { if (t[FECHA_DE[st]] && !doc.statusDates[st]) doc.statusDates[st] = t[FECHA_DE[st]]; });
      var guiaNo = op.trackingNo || t.trackingNo || '';
      if (guiaNo || op.carrier || t.deliveryDate) {
        var envio = fsGet('sc_envios', r.requestNo), s = envio ? JSON.parse(JSON.stringify(envio)) : { requestNo: r.requestNo };
        if (!s.trackingNo && guiaNo) s.trackingNo = guiaNo;
        if (!s.carrier && op.carrier) s.carrier = PAQ.indexOf(op.carrier) >= 0 ? op.carrier : 'OTHER';
        if (s.carrier === 'OTHER' && !s.otherCarrierName && op.carrier) s.otherCarrierName = op.carrier;
        if (!s.carrier && /^1Z[0-9A-Z]{16}$/.test(s.trackingNo || '')) s.carrier = 'UPS';
        if (!s.shipDate && t.shipDate) s.shipDate = diaLocal(t.shipDate);
        if (!s.deliveredAt && t.deliveryDate) s.deliveredAt = t.deliveryDate;
        if (s.carrier === 'UPS' && s.trackingNo && !s.trackingUrl) s.trackingUrl = 'https://www.ups.com/track?tracknum=' + encodeURIComponent(s.trackingNo);
        s.source = s.source || 'Sample Request base';
        if (!envio) fsCreate('sc_envios', r.requestNo, s); else fsReplace('sc_envios', r.requestNo, s, envio);
        if (!doc.deliveryMode && (s.trackingNo || s.carrier)) doc.deliveryMode = 'COURIER';
      }
      if (!previa) {
        if (fsCreate('sc_solicitudes', r.requestNo, doc)) {
          fsCreate('sc_contactos', r.requestNo, { email: email });
          fsCreate('sc_historial', 'STH-SRC-' + r.requestNo, { id: 'STH-SRC-' + r.requestNo, requestNo: r.requestNo, from: null, to: estado, at: r.createdAt || ahora, area: 'SYSTEM', notes: 'Imported from Sample Request base', exception: null });
          nuevoEvento(r.requestNo, 'Request received', r.createdAt || ahora); res.creadas++;
        }
      } else {
        fsReplace('sc_solicitudes', r.requestNo, doc, previa);
        var c2 = fsGet('sc_contactos', r.requestNo); if (!c2 || c2.email !== email) fsReplace('sc_contactos', r.requestNo, { email: email }, c2);
        res.actualizadas++;
      }
      hashes[r.requestNo] = h;
    });
    // Inventario: la base manda (descuenta por folio). Nunca se borra un artículo.
    var hc = sha1(JSON.stringify(cat));
    // Desde ajustes.inventoryFrom la plataforma lleva las existencias: de la base solo se toman artículos nuevos.
    var aj0 = fsGet('sc_config', 'ajustes'), desde = aj0 && aj0.inventoryFrom, nuevos = {};
    if (meta.catalogo !== hc) {
      var actuales = {}; fsList('sc_inventario').forEach(function (x) { actuales[x.__id] = x; });
      cat.items.forEach(function (it) {
        var ex = actuales[it.itemId];
        if (!ex) { it.sourceOnHand = it.onHand; it.reserved = 0; it.inSource = true; it.importedAt = ahora; if (fsCreate('sc_inventario', it.itemId, it)) { res.articulos++; nuevos[it.itemId] = true; } return; }
        var cambio = ['sku', 'model', 'color', 'format', 'sampleType', 'formLabel', desde ? null : 'onHand', 'location', 'backupLocation', 'display'].filter(Boolean).some(function (k) { return JSON.stringify(ex[k]) !== JSON.stringify(it[k]); }) || ex.inSource !== true;
        if (cambio) { var nx = JSON.parse(JSON.stringify(ex)); Object.keys(it).forEach(function (k) { nx[k] = it[k]; }); if (desde) nx.onHand = ex.onHand; nx.sourceOnHand = it.onHand; nx.inSource = true; fsReplace('sc_inventario', it.itemId, nx, ex); res.existencias++; }
      });
      var fis = fsGet('sc_config', 'fisico');
      if (cat.fisico.length && (!desde || !fis || !(fis.rows || []).length)) fsReplace('sc_config', 'fisico', { rows: cat.fisico }, fis);
      meta.catalogo = hc;
    }
    // Descuentos de la base como movimientos del folio (id determinista: no se duplican).
    var hm = sha1(JSON.stringify(movimientos));
    if (meta.movimientos !== hm) {
      var inv = fsList('sc_inventario'), creadas = {};
      fsList('sc_solicitudes').forEach(function (q) { creadas[q.__id] = q.createdAt || ''; });
      movimientos.forEach(function (m) {
        if (desde && creadas[m.requestNo] !== undefined && String(creadas[m.requestNo]) >= desde) return; // lo descuenta la plataforma
        var c = inv.filter(function (i) { return norm(i.model) === norm(m.model) && norm(i.color) === norm(m.color); });
        var it = c.filter(function (i) { return norm(i.location) === norm(m.location) && norm(i.sampleType) === norm(m.sampleType); })[0] || c.filter(function (i) { return norm(i.location) === norm(m.location); })[0] || c[0];
        var antes = m.before, despues = m.after, fresco = desde && it && !nuevos[it.__id] ? fsGet('sc_inventario', it.__id) : null;
        if (fresco) { antes = fresco.onHand; despues = Math.max(0, fresco.onHand - (m.qty || 0)); }
        if (fsCreate('sc_movimientos', m.id, { id: m.id, at: m.at || ahora, type: 'ISSUE', itemId: it ? it.__id : null, qty: m.qty, requestNo: m.requestNo, area: 'SYSTEM', source: 'BASE', model: m.model, color: m.color, sampleType: m.sampleType, location: m.location, before: antes, after: despues, note: m.note || 'Deducted by the Sample Request base' })) {
          res.descuentos++;
          if (fresco) { var nf = JSON.parse(JSON.stringify(fresco)); nf.onHand = despues; fsReplace('sc_inventario', it.__id, nf, fresco); } // ya no se copia la existencia de la base
        }
      });
      meta.movimientos = hm;
    }
    var inv2 = descontarInventario(); res.inventario = inv2.descontados; res.regresados = inv2.regresados;
    meta.hashes = hashes; meta.lastSync = ahora; meta.source = fuente;
    fsReplace('sc_config', 'meta', meta, fsGet('sc_config', 'meta'));
    if (res.creadas || res.actualizadas || res.estatus || res.conflictos || res.articulos || res.existencias || res.descuentos || res.inventario || res.regresados) { var y = rid('SYN'); fsCreate('sc_sync', y, { id: y, at: ahora, requestNo: null, action: 'SYNC', detail: JSON.stringify(res), source: fuente }); }
    return res;
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ inventario de la plataforma */
// Igual que js/domain/inventory.js (reconcileInventory): cada folio creado desde ajustes.inventoryFrom se descuenta al
// llegar, línea por línea, del artículo del mismo modelo y color (prefiriendo corte o pieza completa). Si el folio se
// cancela o se excluye, las piezas regresan. Mismos ids que la plataforma: nunca se descuenta dos veces.
function ubicacion(loc) { var m = String(loc || '').match(/mueble\s*([A-Z0-9]+)\s*·?\s*pos\.?\s*([0-9.]+)/i); return m ? { mueble: m[1].toUpperCase(), pos: m[2] } : null; }
function moverFisico(it, delta) {
  var u = ubicacion(it.location); if (!u) return;
  var f = fsGet('sc_config', 'fisico'); if (!f || !f.rows) return;
  var n = JSON.parse(JSON.stringify(f)), cambio = false;
  n.rows.forEach(function (x) { if (String(x.cabinet).toUpperCase() === u.mueble && String(x.position) === u.pos && norm(x.model) === norm(it.model) && norm(x.color) === norm(it.color) && typeof x.quantity === 'number') { x.quantity = Math.max(0, x.quantity + delta); cambio = true; } });
  if (cambio) fsReplace('sc_config', 'fisico', n, f);
}
function descontarInventario() {
  var res = { descontados: 0, regresados: 0 }, aj = fsGet('sc_config', 'ajustes'), desde = aj && aj.inventoryFrom, ahora = new Date().toISOString();
  if (!desde) { var na = aj ? JSON.parse(JSON.stringify(aj)) : {}; na.inventoryFrom = ahora; if (aj) fsReplace('sc_config', 'ajustes', na, aj); else fsCreate('sc_config', 'ajustes', na); return res; }
  var movs = fsList('sc_movimientos'), devueltos = {};
  movs.forEach(function (m) { if (m.type === 'RETURN' && m.source === 'AUTO') devueltos[m.ref] = true; });
  var activos = movs.filter(function (m) { return m.source === 'AUTO' && m.type === 'ISSUE' && !devueltos[m.__id]; });
  fsList('sc_solicitudes').forEach(function (req) {
    var no = req.__id; if (!(String(req.createdAt || '') >= desde)) return;
    var mios = activos.filter(function (m) { return m.requestNo === no; });
    if (req.status === 'CANCELLED' || req.inventoryExcluded) {
      var porque = req.inventoryExcluded ? 'Request excluded from inventory' : 'Request cancelled';
      mios.forEach(function (m) {
        var id = 'MOV-RET-' + m.__id.replace(/^MOV-/, ''), it = m.itemId ? fsGet('sc_inventario', m.itemId) : null;
        if (!fsCreate('sc_movimientos', id, { id: id, ref: m.__id, at: ahora, type: 'RETURN', source: 'AUTO', itemId: m.itemId, qty: m.qty, requestNo: no, line: m.line, area: 'SYSTEM', model: m.model, color: m.color, sampleType: m.sampleType, location: m.location, before: it ? it.onHand : null, after: it ? it.onHand + m.qty : null, note: porque })) return;
        if (it) { var ni = JSON.parse(JSON.stringify(it)); ni.onHand = it.onHand + m.qty; fsReplace('sc_inventario', m.itemId, ni, it); moverFisico(it, m.qty); }
      });
      if (mios.length) { nuevoEvento(no, 'Inventory returned (' + porque + ')', ahora); res.regresados++; }
      return;
    }
    var hubo = false;
    (req.lines || []).forEach(function (line) {
      if (!(line.pieces > 0) || mios.some(function (m) { return m.line === line.line; })) return;
      var corte = /cut/i.test(line.pieceSize || '');
      var cands = fsList('sc_inventario').filter(function (i) { return norm(i.model) === norm(line.model) && norm(i.color) === norm(line.color) && i.onHand > 0; })
        .map(function (i) { i.pref = corte ? /CUT/i.test(i.sampleType) : /STANDARD/i.test(i.sampleType); return i; })
        .sort(function (a, b) { return Number(b.pref) - Number(a.pref) || Number(b.onHand >= line.pieces) - Number(a.onHand >= line.pieces) || b.onHand - a.onHand; });
      if (!cands.length) return;
      var iid = cands[0].__id, it = fsGet('sc_inventario', iid), qty = Math.min(line.pieces, it.onHand);
      var n = movs.filter(function (m) { return m.source === 'AUTO' && m.type === 'ISSUE' && m.requestNo === no && m.line === line.line; }).length + 1;
      var id = 'MOV-AUTO-' + no + '-L' + line.line + '-' + n, nota = 'Automatic deduction on request arrival' + (qty < line.pieces ? ' — only ' + qty + ' of ' + line.pieces + ' in stock' : '');
      if (!fsCreate('sc_movimientos', id, { id: id, at: ahora, type: 'ISSUE', source: 'AUTO', itemId: iid, qty: qty, requestNo: no, line: line.line, area: 'SYSTEM', model: it.model, color: it.color, sampleType: it.sampleType, location: it.location, before: it.onHand, after: it.onHand - qty, note: nota })) return;
      var ni = JSON.parse(JSON.stringify(it)); ni.onHand = it.onHand - qty; fsReplace('sc_inventario', iid, ni, it); moverFisico(it, -qty);
      hubo = true; res.descontados++;
    });
    if (hubo) nuevoEvento(no, 'Inventory deducted automatically on request arrival', ahora);
  });
  return res;
}

/* ------------------------------------------------------------------ 2. recordatorios de avisos */
var ETIQUETA = { PUBLIC_HOLIDAY: 'Public Holiday', WAREHOUSE_CLOSURE: 'Warehouse Closure', OPERATIONAL_DELAY: 'Operational Delay', TEMPORARY_SUSPENSION: 'Temporary Suspension', GENERAL_NOTICE: 'General Notice', OTHER: 'Other' };
var CORREO_OK = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;
function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function tarjetaAviso(n, folios, nombre) {
  var fecha = Utilities.formatDate(new Date(), CONFIG.ZONA, 'MMM dd, yyyy'), periodo = n.start === n.end ? n.start : n.start + ' to ' + n.end;
  var fila = function (k, v) { return '<tr><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:12px;color:#6B7174;text-transform:uppercase;letter-spacing:1px;width:40%">' + esc(k) + '</td><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:14px;font-weight:600;color:#191D20">' + esc(v) + '</td></tr>'; };
  var saludo = nombre ? 'Dear ' + esc(nombre) + ',' : 'Dear Customer,';
  var html = '<!doctype html><html><body style="margin:0;padding:24px 0;background:#F7F7F5;font-family:Montserrat,Figtree,Arial,Helvetica,sans-serif;color:#202324"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E4E2DD;border-radius:12px;overflow:hidden">' +
    '<tr><td style="padding:28px 32px 18px;border-bottom:4px solid #C5532E"><img src="' + CONFIG.SITIO + 'assets/logo-cesantoni.png" alt="CESANTONI" width="180" style="display:block;width:180px;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 32px 4px"><div style="font-size:12px;letter-spacing:2px;color:#C5532E;font-weight:700;text-transform:uppercase">Sample Request Update</div><h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#191D20">' + esc(ETIQUETA[n.category]) + ' (reminder)</h1></td></tr>' +
    '<tr><td style="padding:16px 32px 4px;font-size:15px;line-height:1.6"><p style="margin:0 0 10px">' + saludo + '</p><p style="margin:0 0 10px;white-space:pre-line">' + esc(n.message) + '</p></td></tr>' +
    '<tr><td style="padding:12px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECEAE5;border-radius:8px">' + fila('Notice type', ETIQUETA[n.category]) + fila('Period', periodo) + fila(folios.length > 1 ? 'Affected requests' : 'Request number', folios.join(', ')) + '</table></td></tr>' +
    '<tr><td style="padding:22px 32px 28px;font-size:14px;line-height:1.6;color:#4A4F52">Kind regards,<br><strong style="color:#191D20">CESANTONI Logistics</strong><br>Sample Requests Team</td></tr>' +
    '<tr><td style="padding:14px 32px;background:#191D20;color:#B9BDBF;font-size:11px;line-height:1.5">CESANTONI · Porcelanato Premium<br>Notice date: ' + esc(fecha) + ' · This is an automated message regarding your sample request.</td></tr></table></td></tr></table></body></html>';
  var texto = saludo + '\n\n' + n.message + '\n\nNotice type: ' + ETIQUETA[n.category] + '\nPeriod: ' + periodo + '\nRequests: ' + folios.join(', ') + '\n\nKind regards,\nCESANTONI Logistics — Sample Requests Team';
  return { subject: 'CESANTONI operational notice — ' + ETIQUETA[n.category], html: html, text: texto };
}
function recordatorios() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  try {
    var dia = hoy(), avisos = fsList('sc_avisos').filter(function (n) { return n.status === 'ACTIVE' && n.notify && n.nextRunDate && n.nextRunDate <= dia; });
    if (!avisos.length) return 0;
    var ajustes = fsGet('sc_config', 'ajustes') || {}, prueba = ajustes.emailMode !== 'PRODUCTION';
    var solicitudes = fsList('sc_solicitudes'), contactos = {};
    fsList('sc_contactos').forEach(function (c) { contactos[c.__id] = c.email || ''; });
    var enviados = 0;
    avisos.forEach(function (n) {
      var inicial = !(n.runs || []).length;
      if (!inicial && (!n.reminder || !n.reminder.enabled || n.reminder.stopped || dia > n.reminder.until)) { n.nextRunDate = null; fsReplace('sc_avisos', n.__id, n, n); return; }
      var grupos = {};
      solicitudes.forEach(function (r) {
        if (['DELIVERED', 'CANCELLED'].indexOf(r.status) >= 0) return;
        if (n.scope === 'ONE' && r.requestNo !== n.requestNo) return;
        if (n.filters && n.filters.country && r.country !== n.filters.country) return;
        if (n.filters && n.filters.deliveryMode && r.deliveryMode !== n.filters.deliveryMode) return;
        var c = String(contactos[r.requestNo] || '').trim().toLowerCase(); if (!CORREO_OK.test(c)) return;
        (grupos[c] = grupos[c] || { nombre: r.customer && r.customer.fullName, folios: [] }).folios.push(r.requestNo);
      });
      Object.keys(grupos).forEach(function (correo) {
        var g = grupos[correo], tarjeta = tarjetaAviso(n, g.folios, g.nombre), opKey = 'notice:' + n.id + ':' + dia + ':' + correo, id = 'EML-' + sha1(opKey).slice(0, 24);
        var reg = { id: id, opKey: opKey, requestNos: g.folios, type: 'OPERATIONAL_NOTICE', to: correo, subject: tarjeta.subject, html: tarjeta.html, text: tarjeta.text, noticeId: n.id, status: 'QUEUED', statusReason: '', attempts: 0, providerId: null, error: '', createdAt: new Date().toISOString(), sentAt: null, deliveredTo: null };
        if (!fsCreate('sc_correos', id, reg)) return; // ya se envió hoy: no se duplica
        var destino = prueba ? ajustes.testRecipient : correo;
        if (!CORREO_OK.test(destino || '')) { reg.statusReason = 'TEST mode: no test recipient configured — not sent'; fsReplace('sc_correos', id, reg, fsGet('sc_correos', id)); return; }
        try {
          MailApp.sendEmail({ to: destino, subject: (prueba ? '[TEST] ' : '') + tarjeta.subject, htmlBody: tarjeta.html, body: tarjeta.text, name: 'CESANTONI Samples' });
          reg.status = 'SENT'; reg.sentAt = new Date().toISOString(); reg.providerId = 'apps-script'; reg.deliveredTo = prueba ? 'TEST_RECIPIENT' : 'CUSTOMER'; reg.attempts = 1; enviados++;
          g.folios.forEach(function (f) { var e = rid('EVT'); fsCreate('sc_eventos', e, { id: e, at: reg.sentAt, requestNo: f, event: 'Customer notification sent (reminder)' + (prueba ? ' (test recipient)' : ''), area: 'System' }); });
        } catch (err) { reg.status = 'FAILED'; reg.error = String(err.message || err).slice(0, 300); reg.attempts = 1; }
        fsReplace('sc_correos', id, reg, fsGet('sc_correos', id));
        g.folios.forEach(function (f) { if ((n.requestNos || []).indexOf(f) < 0) (n.requestNos = n.requestNos || []).push(f); });
      });
      (n.runs = n.runs || []).push({ runKey: dia, at: new Date().toISOString(), emails: Object.keys(grupos).length });
      var sig = n.reminder && n.reminder.enabled && !n.reminder.stopped ? sumarDias(dia, n.reminder.frequencyDays) : null;
      n.nextRunDate = sig && sig <= n.reminder.until ? sig : null;
      fsReplace('sc_avisos', n.__id, n, fsGet('sc_avisos', n.__id));
    });
    return enviados;
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ 4. rastreo UPS y avisos automáticos de estatus */
// rastreo() cada 15 min: consulta UPS (Track API, si hay credenciales) y lee los avisos de UPS del Gmail de este script. Guarda el estatus
// de la paquetería y la fecha estimada, y mueve el folio solo: Shipped → In Transit → Delivered (queda como System).
// Después envía el correo al cliente de cada cambio automático (Shipped y Delivered), respetando el modo PRUEBA/PRODUCCIÓN.
// Credenciales de UPS (developer.ups.com): Configuración del proyecto › Propiedades del script › UPS_CLIENT_ID y UPS_CLIENT_SECRET.
var ESTATUS_ETIQUETA = { RECEIVED: 'Received', PREPARING: 'Preparing', PREPARED: 'Prepared', READY_FOR_PICKUP: 'Ready for Pickup', SHIPPED: 'Shipped', IN_TRANSIT: 'In Transit', DELIVERED: 'Delivered', ON_HOLD: 'On Hold', CANCELLED: 'Cancelled' };
var ESTATUS_MENSAJE = { SHIPPED: 'Your samples have been shipped.', IN_TRANSIT: 'Your samples are in transit with the carrier.', DELIVERED: 'Your samples have been delivered.' };
var PAQ_NOMBRE = { FEDEX: 'FedEx', UPS: 'UPS', DHL: 'DHL Express', USPS: 'USPS', ESTAFETA: 'Estafeta', PAQUETEXPRESS: 'Paquetexpress' };
var AVISAR_AUTO = ['SHIPPED', 'DELIVERED']; // In Transit cambia el estatus sin correo (llega el mismo día que Shipped)

function tokenUps() {
  var cache = CacheService.getScriptCache(), t = cache.get('ups_token'); if (t) return t;
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('UPS_CLIENT_ID'), secreto = p.getProperty('UPS_CLIENT_SECRET');
  if (!id || !secreto) return null;
  var r = UrlFetchApp.fetch('https://onlinetools.ups.com/security/v1/oauth/token', { method: 'post', muteHttpExceptions: true, contentType: 'application/x-www-form-urlencoded',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secreto) }, payload: 'grant_type=client_credentials' });
  if (r.getResponseCode() >= 300) throw new Error('UPS token ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  var j = JSON.parse(r.getContentText());
  cache.put('ups_token', j.access_token, Math.max(60, Math.min(21000, Number(j.expires_in || 3600) - 120)));
  return j.access_token;
}
function fechaUps(d, t) { // UPS: fecha YYYYMMDD y hora HHMMSS locales del lugar del evento
  if (!/^\d{8}$/.test(d || '')) return '';
  var h = /^\d{6}$/.test(t || '') ? t : '120000';
  return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8) + 'T' + h.slice(0, 2) + ':' + h.slice(2, 4) + ':' + h.slice(4, 6);
}
function consultarUps(token, guia) {
  var r = UrlFetchApp.fetch('https://onlinetools.ups.com/api/track/v1/details/' + encodeURIComponent(guia) + '?locale=en_US&returnSignature=false', { method: 'get', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, transId: Utilities.getUuid().slice(0, 32), transactionSrc: 'cesantoni-samples' } });
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() >= 300) throw new Error('UPS ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  var pk = (((JSON.parse(r.getContentText()).trackResponse || {}).shipment || [])[0] || {}).package; pk = pk && pk[0];
  if (!pk) return null;
  var act = (pk.activity || [])[0] || {}, st = act.status || {}, loc = ((act.location || {}).address) || {};
  var entrega = (pk.deliveryDate || []).filter(function (x) { return x.type === 'DEL'; })[0], estimada = (pk.deliveryDate || []).filter(function (x) { return x.type !== 'DEL'; })[0];
  return {
    type: String(st.type || '').toUpperCase(), code: st.code || '', description: (pk.currentStatus && pk.currentStatus.description) || st.description || '',
    at: fechaUps(act.date, act.time), location: [loc.city, loc.stateProvince, loc.countryCode].filter(Boolean).join(', '),
    deliveredOn: entrega ? fechaUps(entrega.date, (pk.deliveryTime || {}).endTime) : '', estimated: estimada && /^\d{8}$/.test(estimada.date) ? estimada.date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : ''
  };
}
function cambioAutomatico(no, a, nota) { // estatus automático: historial (auto) + bitácora; el correo lo manda avisosAutomaticos()
  var req = fsGet('sc_solicitudes', no); if (!req || req.status === a) return false;
  var de = req.status, ahora = new Date().toISOString();
  req.status = a; req.statusChangedAt = ahora; req.statusDates = req.statusDates || {}; if (!req.statusDates[a]) req.statusDates[a] = ahora;
  fsReplace('sc_solicitudes', no, JSON.parse(JSON.stringify(req)), req);
  var hid = rid('STH'); fsCreate('sc_historial', hid, { id: hid, requestNo: no, from: de, to: a, at: ahora, area: 'SYSTEM', auto: true, notes: nota, exception: null });
  nuevoEvento(no, 'Status updated automatically: ' + ESTATUS_ETIQUETA[de] + ' → ' + ESTATUS_ETIQUETA[a] + ' (' + nota.replace(/^Automatic: /, '') + ')', ahora);
  return true;
}
// Guarda el estatus de la paquetería en el envío y mueve el folio: UPS en tránsito → In Transit; entregado → Delivered.
function aplicarPaqueteria(no, req, u) {
  var prev = fsGet('sc_envios', no); if (!prev) return 0;
  if (prev.carrierStatus && prev.carrierStatus.at && u.at && u.at < prev.carrierStatus.at) return 0; // un aviso más viejo no pisa uno nuevo
  var env = JSON.parse(JSON.stringify(prev));
  env.carrierStatus = { type: u.type, code: u.code || '', description: u.description, at: u.at, location: u.location || '', checkedAt: new Date().toISOString(), source: u.source || 'UPS API' };
  if (u.estimated && u.type !== 'D') { env.estimatedDate = u.estimated; env.estimateConfirmed = true; }
  if (u.type === 'D' && !env.deliveredAt) env.deliveredAt = u.deliveredOn || u.at;
  fsReplace('sc_envios', no, env, prev);
  if (u.type === 'D' && ['SHIPPED', 'IN_TRANSIT'].indexOf(req.status) >= 0) return cambioAutomatico(no, 'DELIVERED', 'Automatic: UPS reports delivered') ? 1 : 0;
  if (['I', 'P', 'O'].indexOf(u.type) >= 0 && req.status === 'SHIPPED') return cambioAutomatico(no, 'IN_TRANSIT', 'Automatic: UPS reports in transit') ? 1 : 0;
  return 0;
}
// Avisos de UPS que llegan al Gmail de la cuenta dueña de este script (UPS My Choice / notificaciones de envío).
// Solo lee correos de ups.com de los últimos días; no los modifica. Reconoce la guía 1Z… y el tipo de aviso.
function leerAvisoUps(asunto, cuerpo) {
  var t = (asunto + '\n' + cuerpo).toUpperCase();
  var guias = {}; (t.match(/1Z(?:[ \t]?[0-9A-Z]){16}/g) || []).forEach(function (g) { guias[g.replace(/\s+/g, '')] = true; });
  var a = asunto.toLowerCase(), c = cuerpo.toLowerCase(), tipo = null, desc = '';
  if (/delivered/.test(a) && !/(will be|to be|scheduled|expected|estimated)[^.]{0,30}deliver/.test(a)) { tipo = 'D'; desc = 'Delivered'; }
  else if (/exception|delay|unable to deliver|returned to sender|return to sender/.test(a)) { tipo = 'X'; desc = 'Exception'; }
  else if (/out for delivery/.test(a + ' ' + c.slice(0, 600))) { tipo = 'O'; desc = 'Out for Delivery'; }
  else if (/on the way|in transit|scheduled for delivery|arriving|departed|arrived|picked up|update/.test(a)) { tipo = 'I'; desc = 'In Transit'; }
  else if (/ship notification|label created|shipment details|has shipped|shipped/.test(a)) { tipo = 'M'; desc = 'Label Created'; }
  if (!tipo && /delivered/.test(c) && /(your package|package was|has been) delivered|delivered on/.test(c)) { tipo = 'D'; desc = 'Delivered'; }
  var est = (cuerpo.match(/(?:scheduled|estimated)\s+delivery[^0-9]{0,40}(\d{1,2})\/(\d{1,2})\/(\d{4})/i) || []);
  return { guias: Object.keys(guias), type: tipo, description: desc, estimated: est.length ? est[3] + '-' + ('0' + est[1]).slice(-2) + '-' + ('0' + est[2]).slice(-2) : '' };
}
// Gmail API de solo lectura (permiso gmail.readonly): busca, no modifica ni borra nada.
function gmailUps() {
  var api = 'https://gmail.googleapis.com/gmail/v1/users/me/messages', h = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var r = UrlFetchApp.fetch(api + '?maxResults=100&q=' + encodeURIComponent('from:ups.com newer_than:7d'), { headers: h, muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error('Gmail ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return (JSON.parse(r.getContentText()).messages || []).map(function (x) {
    var m = JSON.parse(UrlFetchApp.fetch(api + '/' + x.id + '?format=full', { headers: h, muteHttpExceptions: true }).getContentText());
    var hd = {}; ((m.payload || {}).headers || []).forEach(function (y) { hd[y.name.toLowerCase()] = y.value; });
    var texto = '', html = '';
    (function partes(p) {
      if (!p) return;
      if (p.body && p.body.data) { var d = Utilities.newBlob(Utilities.base64DecodeWebSafe(p.body.data)).getDataAsString('UTF-8'); if (/text\/plain/i.test(p.mimeType)) texto += d; else if (/text\/html/i.test(p.mimeType)) html += d; }
      (p.parts || []).forEach(partes);
    })(m.payload);
    if (!texto) texto = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    return { subject: hd.subject || '', from: hd.from || '', date: new Date(Number(m.internalDate) || Date.parse(hd.date)), body: texto };
  });
}
function correosUps() {
  var res = { leidos: 0, cambios: 0 };
  var porGuia = {}, solicitudes = {};
  fsList('sc_envios').forEach(function (s) { if (s.trackingNo) porGuia[String(s.trackingNo).toUpperCase()] = s.__id; });
  fsList('sc_solicitudes').forEach(function (r) { solicitudes[r.__id] = r; });
  var mensajes = gmailUps();
  mensajes.sort(function (x, y) { return x.date - y.date; }); // del más viejo al más nuevo: queda el último aviso
  mensajes.forEach(function (m) {
    if (!/ups\.com/i.test(m.from)) return;
    var u = leerAvisoUps(m.subject, m.body); if (!u.type) return;
    u.at = Utilities.formatDate(m.date, CONFIG.ZONA, "yyyy-MM-dd'T'HH:mm:ss"); u.source = 'UPS email';
    u.guias.forEach(function (g) {
      var no = porGuia[g], req = no && solicitudes[no]; if (!req || ['CANCELLED'].indexOf(req.status) >= 0) return;
      res.leidos++;
      var n = aplicarPaqueteria(no, req, u); res.cambios += n;
      if (n) solicitudes[no] = fsGet('sc_solicitudes', no);
    });
  });
  return res;
}

function rastreo() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  var res = { consultadas: 0, cambios: 0, errores: 0 };
  try {
    var token = tokenUps();
    if (token) {
      var solicitudes = {}; fsList('sc_solicitudes').forEach(function (r) { solicitudes[r.__id] = r; });
      fsList('sc_envios').forEach(function (s) {
        var no = s.__id, req = solicitudes[no];
        if (!req || s.carrier !== 'UPS' || !s.trackingNo || ['DELIVERED', 'CANCELLED', 'ON_HOLD'].indexOf(req.status) >= 0) return;
        var u;
        try { u = consultarUps(token, s.trackingNo); res.consultadas++; } catch (e) { res.errores++; return; }
        if (u) res.cambios += aplicarPaqueteria(no, req, u);
      });
    }
    try { var cu = correosUps(); res.correosUps = cu.leidos; res.cambios += cu.cambios; } catch (e) { res.errorGmail = String(e.message || e).slice(0, 300); console.error('Avisos UPS en Gmail: ' + res.errorGmail); }
    res.correos = avisosAutomaticos();
    return res;
  } finally { lock.releaseLock(); }
}
function tarjetaEstatus(req, estado, envio, nombre) {
  var fecha = Utilities.formatDate(new Date(), CONFIG.ZONA, 'MMM dd, yyyy');
  var fila = function (k, v, crudo) { return '<tr><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:12px;color:#6B7174;text-transform:uppercase;letter-spacing:1px;width:40%">' + esc(k) + '</td><td style="padding:10px 14px;border-bottom:1px solid #F0EEEA;font-size:14px;font-weight:600;color:#191D20">' + (crudo ? v : esc(v)) + '</td></tr>'; };
  var filas = fila('Request number', req.requestNo) + fila('Current status', ESTATUS_ETIQUETA[estado]), e = envio || {};
  if (e.trackingNo) {
    filas += fila('Carrier', e.carrier === 'OTHER' ? (e.otherCarrierName || 'Carrier') : (PAQ_NOMBRE[e.carrier] || e.carrier || '—')) + fila('Tracking number', e.trackingNo);
    if (e.trackingUrl) filas += fila('Tracking', '<a href="' + esc(e.trackingUrl) + '" style="color:#C5532E;font-weight:700">TRACK YOUR SHIPMENT</a>', true);
    if (e.estimatedDate && e.estimateConfirmed && estado !== 'DELIVERED') filas += fila('Estimated delivery (carrier-confirmed)', e.estimatedDate);
  }
  var saludo = nombre ? 'Dear ' + esc(nombre) + ',' : 'Dear Customer,';
  var html = '<!doctype html><html><body style="margin:0;padding:24px 0;background:#F7F7F5;font-family:Montserrat,Figtree,Arial,Helvetica,sans-serif;color:#202324"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#FFFFFF;border:1px solid #E4E2DD;border-radius:12px;overflow:hidden">' +
    '<tr><td style="padding:28px 32px 18px;border-bottom:4px solid #C5532E"><img src="' + CONFIG.SITIO + 'assets/logo-cesantoni.png" alt="CESANTONI" width="180" style="display:block;width:180px;height:auto;border:0"></td></tr>' +
    '<tr><td style="padding:26px 32px 4px"><div style="font-size:12px;letter-spacing:2px;color:#C5532E;font-weight:700;text-transform:uppercase">Sample Request Update</div><h1 style="margin:8px 0 0;font-size:22px;line-height:1.3;color:#191D20">Request ' + esc(req.requestNo) + ': ' + esc(ESTATUS_ETIQUETA[estado]) + '</h1></td></tr>' +
    '<tr><td style="padding:16px 32px 4px;font-size:15px;line-height:1.6"><p style="margin:0 0 10px">' + saludo + '</p><p style="margin:0 0 10px">' + esc(ESTATUS_MENSAJE[estado]) + '</p></td></tr>' +
    '<tr><td style="padding:12px 32px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ECEAE5;border-radius:8px">' + filas + '</table></td></tr>' +
    '<tr><td style="padding:22px 32px 28px;font-size:14px;line-height:1.6;color:#4A4F52">Kind regards,<br><strong style="color:#191D20">CESANTONI Logistics</strong><br>Sample Requests Team</td></tr>' +
    '<tr><td style="padding:14px 32px;background:#191D20;color:#B9BDBF;font-size:11px;line-height:1.5">CESANTONI · Porcelanato Premium<br>Notice date: ' + esc(fecha) + ' · This is an automated message regarding your sample request.</td></tr></table></td></tr></table></body></html>';
  var texto = [saludo, ESTATUS_MENSAJE[estado], 'Request number: ' + req.requestNo, 'Current status: ' + ESTATUS_ETIQUETA[estado],
    e.trackingNo ? 'Carrier: ' + (PAQ_NOMBRE[e.carrier] || e.carrier) + '\nTracking number: ' + e.trackingNo + (e.trackingUrl ? '\nTrack: ' + e.trackingUrl : '') : '',
    'Kind regards,\nCESANTONI Logistics — Sample Requests Team', 'Notice date: ' + fecha].filter(Boolean).join('\n\n');
  return { subject: 'CESANTONI sample request ' + req.requestNo + ' — ' + ESTATUS_ETIQUETA[estado], html: html, text: texto };
}
// Correo de cada cambio automático (Shipped por guía + foto, Delivered por UPS). Mismo id que usa la plataforma: nunca se duplica.
// Si una sesión de CESANTONI ya lo creó, se deja 5 minutos para que la propia plataforma lo envíe.
function avisosAutomaticos() {
  var ajustes = fsGet('sc_config', 'ajustes') || {}, prueba = ajustes.emailMode !== 'PRODUCTION', enviados = 0, ahora = Date.now();
  var correos = {}; fsList('sc_correos').forEach(function (c) { if (c.opKey && c.opKey.indexOf('auto:') === 0) correos[c.opKey] = c; });
  fsList('sc_historial').filter(function (h) { return h.auto && AVISAR_AUTO.indexOf(h.to) >= 0; }).forEach(function (h) {
    var opKey = 'auto:' + h.id, id = 'EML-' + sha1(opKey).slice(0, 24), reg = correos[opKey];
    if (reg && reg.status !== 'QUEUED') return; // enviado, enviándose o fallido (se reintenta desde Notificaciones)
    if (reg && reg.origin !== 'APPS_SCRIPT' && ahora - Date.parse(reg.createdAt) < 5 * 60e3) return;
    var req = fsGet('sc_solicitudes', h.requestNo); if (!req || req.status !== h.to) return;
    var contacto = fsGet('sc_contactos', h.requestNo), correo = String(contacto && contacto.email || '').trim().toLowerCase();
    if (!CORREO_OK.test(correo)) return;
    if (!reg) {
      var tarjeta = tarjetaEstatus(req, h.to, fsGet('sc_envios', h.requestNo), req.customer && req.customer.fullName);
      reg = { origin: 'APPS_SCRIPT', id: id, opKey: opKey, requestNos: [h.requestNo], type: 'STATUS_UPDATE', to: correo, subject: tarjeta.subject, html: tarjeta.html, text: tarjeta.text, noticeId: null, status: 'QUEUED', statusReason: '', attempts: 0, providerId: null, error: '', createdAt: new Date().toISOString(), sentAt: null, deliveredTo: null };
      if (!fsCreate('sc_correos', id, reg)) return;
    }
    var destino = prueba ? ajustes.testRecipient : reg.to, prev = fsGet('sc_correos', id);
    if (!CORREO_OK.test(destino || '')) {
      if (reg.statusReason !== 'TEST mode: no test recipient configured — not sent') { reg.statusReason = 'TEST mode: no test recipient configured — not sent'; fsReplace('sc_correos', id, reg, prev); }
      return;
    }
    try {
      MailApp.sendEmail({ to: destino, subject: (prueba ? '[TEST] ' : '') + reg.subject, htmlBody: reg.html, body: reg.text, name: 'CESANTONI Samples' });
      reg.status = 'SENT'; reg.sentAt = new Date().toISOString(); reg.providerId = 'apps-script'; reg.deliveredTo = prueba ? 'TEST_RECIPIENT' : 'CUSTOMER'; reg.statusReason = ''; enviados++;
      nuevoEvento(h.requestNo, 'Customer notification sent (automatic status)' + (prueba ? ' (test recipient)' : ''), reg.sentAt);
    } catch (err) { reg.status = 'FAILED'; reg.error = String(err.message || err).slice(0, 300); }
    reg.attempts = (reg.attempts || 0) + 1;
    fsReplace('sc_correos', id, reg, prev);
  });
  return enviados;
}

/* ------------------------------------------------------------------ 3. copia a «Base Sample Evidence & Costs» */
var DESTINOS = {
  'STATUS HISTORY': ['EVENT ID', 'REQUEST NO.', 'REQUEST ID', 'EVENT', 'FROM STATUS', 'TO STATUS', 'EVENT DATE', 'USER', 'ROLE', 'NOTES'],
  'EVIDENCE LOG': ['EVIDENCE ID', 'REQUEST NO.', 'REQUEST ID', 'STAGE', 'EVIDENCE TYPE', 'FILE ID', 'FILE URL', 'FILE NAME', 'MIME TYPE', 'UPLOADED AT', 'UPLOADED BY', 'NOTES', 'ACTIVE'],
  'EMAIL LOG': ['EMAIL EVENT ID', 'REQUEST NO.', 'REQUEST ID', 'EMAIL TYPE', 'RECIPIENT', 'SUBJECT', 'CARRIER', 'TRACKING NO.', 'TRACKING URL', 'STATUS', 'SENT AT', 'TRIGGERED BY', 'ERROR MESSAGE'],
  'OPERATION': ['REQUEST NO.', 'REQUEST ID', 'STATUS', 'PREPARATION DATE', 'SHIP DATE', 'DELIVERY DATE', 'CARRIER', 'TRACKING NO.', 'TRACKING URL', 'SHIPPING COST', 'CURRENCY']
};
function area(a) { return a === 'BODEGA' ? 'WAREHOUSE' : (a || 'SYSTEM'); } // áreas, nunca nombres
function filaPara(item) {
  var reqId = function (no) { var r = fsGet('sc_solicitudes', no); return r ? r.requestId || '' : ''; };
  if (item.kind === 'STATUS_HISTORY') {
    var hs = fsList('sc_historial').filter(function (x) { return x.id === item.historyId; })[0]; if (!hs) return null;
    return { hoja: 'STATUS HISTORY', v: { 'EVENT ID': hs.id, 'REQUEST NO.': hs.requestNo, 'REQUEST ID': reqId(hs.requestNo), 'EVENT': hs.exception ? 'STATUS CHANGE (EXCEPTION)' : 'STATUS CHANGE', 'FROM STATUS': hs.from || '', 'TO STATUS': hs.to, 'EVENT DATE': hs.at, 'USER': area(hs.area), 'ROLE': area(hs.area), 'NOTES': [hs.notes, hs.exception && hs.exception.reason].filter(Boolean).join(' · ') } };
  }
  if (item.kind === 'EVIDENCE_LOG') {
    var e = fsGet('sc_evidencias', item.evidenceId); if (!e) return null;
    var f = e.fileId ? fsGet('sc_archivos', e.fileId) : null;
    return { hoja: 'EVIDENCE LOG', v: { 'EVIDENCE ID': e.id, 'REQUEST NO.': e.requestNo, 'REQUEST ID': reqId(e.requestNo), 'STAGE': e.stage, 'EVIDENCE TYPE': e.type, 'FILE ID': f ? f.id : '', 'FILE URL': '', 'FILE NAME': f ? f.name : '', 'MIME TYPE': f ? f.mime : '', 'UPLOADED AT': e.uploadedAt, 'UPLOADED BY': area(e.area), 'NOTES': e.notes || '', 'ACTIVE': true } };
  }
  if (item.kind === 'EMAIL_LOG') {
    var m = fsGet('sc_correos', item.emailId); if (!m) return null;
    var s = fsGet('sc_envios', m.requestNos[0]) || {};
    return { hoja: 'EMAIL LOG', v: { 'EMAIL EVENT ID': m.id, 'REQUEST NO.': m.requestNos.join(', '), 'REQUEST ID': reqId(m.requestNos[0]), 'EMAIL TYPE': m.type, 'RECIPIENT': m.to, 'SUBJECT': m.subject, 'CARRIER': s.carrier || '', 'TRACKING NO.': s.trackingNo || '', 'TRACKING URL': s.trackingUrl || '', 'STATUS': m.status, 'SENT AT': m.sentAt || '', 'TRIGGERED BY': 'CESANTONI', 'ERROR MESSAGE': m.error || m.statusReason || '' } };
  }
  if (item.kind === 'OPERATION') {
    var r = fsGet('sc_solicitudes', item.requestNo); if (!r) return null;
    var sh = fsGet('sc_envios', item.requestNo) || {}, c = fsGet('sc_costos', item.requestNo);
    return { hoja: 'OPERATION', clave: 'REQUEST NO.', v: { 'REQUEST NO.': r.requestNo, 'REQUEST ID': r.requestId || '', 'STATUS': r.status, 'PREPARATION DATE': (r.statusDates || {}).PREPARED || '', 'SHIP DATE': sh.shipDate || '', 'DELIVERY DATE': sh.deliveredAt || '', 'CARRIER': sh.carrier || '', 'TRACKING NO.': sh.trackingNo || '', 'TRACKING URL': sh.trackingUrl || '', 'SHIPPING COST': c && c.amountUsd !== null && c.amountUsd !== undefined ? c.amountUsd : '', 'CURRENCY': 'USD', 'UPDATED BY': 'SYSTEM', 'LAST UPDATED': new Date().toISOString() } };
  }
  return null;
}
function volcarSalida() {
  if (!CONFIG.ESCRIBIR_EN_BASE) return 'desactivado';
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return;
  try {
    var ss = SpreadsheetApp.openById(CONFIG.EVIDENCIAS_ID), hojas = {}, hechos = 0;
    fsList('sc_salida').sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }).slice(0, 100).forEach(function (item) {
      var f = filaPara(item);
      if (f) {
        if (!hojas[f.hoja]) {
          var sh = ss.getSheetByName(f.hoja); if (!sh) throw new Error('No existe la hoja ' + f.hoja);
          var vals = sh.getDataRange().getValues(), h = encabezado(vals, DESTINOS[f.hoja]);
          if (!h) throw new Error('Encabezados distintos en ' + f.hoja + ': no se escribe para proteger la base');
          hojas[f.hoja] = { sh: sh, h: h, vals: vals };
        }
        var H = hojas[f.hoja], ancho = Math.max.apply(null, Object.keys(H.h.idx).map(function (k) { return H.h.idx[k]; })) + 1;
        var fila = []; for (var i = 0; i < ancho; i++) fila.push('');
        Object.keys(f.v).forEach(function (k) { if (H.h.idx[k] !== undefined) fila[H.h.idx[k]] = f.v[k]; });
        var pos = -1;
        if (f.clave) for (var j = H.h.fila + 1; j < H.vals.length; j++) if (H.vals[j][H.h.idx[f.clave]] === f.v[f.clave]) { pos = j; break; }
        if (pos >= 0) H.sh.getRange(pos + 1, 1, 1, ancho).setValues([fila.map(function (x, k) { return x === '' ? H.vals[pos][k] : x; })]);
        else { H.sh.appendRow(fila); H.vals.push(fila); }
      }
      fsDelete('sc_salida', item.__id); hechos++;
    });
    return hechos;
  } finally { lock.releaseLock(); }
}
