/**
 * Samples CESANTONI · tareas en el servidor (Google Apps Script)
 *
 *  1. sincronizar()   cada 15 min: lee «Base Sample Request CESANTONI - English» (solo lectura) y crea en Firestore
 *                     las solicitudes nuevas (sc_solicitudes) con su folio original, el catálogo y el inventario físico.
 *  2. recordatorios() cada hora: envía los recordatorios programados de los avisos operativos (sc_avisos).
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
    if (meta.catalogo !== hc) {
      var actuales = {}; fsList('sc_inventario').forEach(function (x) { actuales[x.__id] = x; });
      cat.items.forEach(function (it) {
        var ex = actuales[it.itemId];
        if (!ex) { it.sourceOnHand = it.onHand; it.reserved = 0; it.inSource = true; it.importedAt = ahora; if (fsCreate('sc_inventario', it.itemId, it)) res.articulos++; return; }
        var cambio = ['sku', 'model', 'color', 'format', 'sampleType', 'formLabel', 'onHand', 'location', 'backupLocation', 'display'].some(function (k) { return JSON.stringify(ex[k]) !== JSON.stringify(it[k]); }) || ex.inSource !== true;
        if (cambio) { var nx = JSON.parse(JSON.stringify(ex)); Object.keys(it).forEach(function (k) { nx[k] = it[k]; }); nx.sourceOnHand = it.onHand; nx.inSource = true; fsReplace('sc_inventario', it.itemId, nx, ex); res.existencias++; }
      });
      if (cat.fisico.length) fsReplace('sc_config', 'fisico', { rows: cat.fisico }, fsGet('sc_config', 'fisico'));
      meta.catalogo = hc;
    }
    // Descuentos de la base como movimientos del folio (id determinista: no se duplican).
    var hm = sha1(JSON.stringify(movimientos));
    if (meta.movimientos !== hm) {
      var inv = fsList('sc_inventario');
      movimientos.forEach(function (m) {
        var c = inv.filter(function (i) { return norm(i.model) === norm(m.model) && norm(i.color) === norm(m.color); });
        var it = c.filter(function (i) { return norm(i.location) === norm(m.location) && norm(i.sampleType) === norm(m.sampleType); })[0] || c.filter(function (i) { return norm(i.location) === norm(m.location); })[0] || c[0];
        if (fsCreate('sc_movimientos', m.id, { id: m.id, at: m.at || ahora, type: 'ISSUE', itemId: it ? it.__id : null, qty: m.qty, requestNo: m.requestNo, area: 'SYSTEM', source: 'BASE', model: m.model, color: m.color, sampleType: m.sampleType, location: m.location, before: m.before, after: m.after, note: m.note || 'Deducted by the Sample Request base' })) res.descuentos++;
      });
      meta.movimientos = hm;
    }
    meta.hashes = hashes; meta.lastSync = ahora; meta.source = fuente;
    fsReplace('sc_config', 'meta', meta, fsGet('sc_config', 'meta'));
    if (res.creadas || res.actualizadas || res.estatus || res.conflictos || res.articulos || res.existencias || res.descuentos) { var y = rid('SYN'); fsCreate('sc_sync', y, { id: y, at: ahora, requestNo: null, action: 'SYNC', detail: JSON.stringify(res), source: fuente }); }
    return res;
  } finally { lock.releaseLock(); }
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
