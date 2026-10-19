/* Samples Center · capa de datos sobre Firebase (proyecto proveedores-cesantoni, colecciones sc_).
 * Mantiene en memoria el mismo objeto `d` que usa la lógica de negocio (js/domain) y guarda los cambios
 * en Firestore dentro de una transacción con control de versiones: si otra persona modificó el mismo
 * registro, la operación se repite con datos frescos en lugar de sobrescribir.
 * La seguridad real la imponen las reglas de Firestore (firestore.rules, bloque «Samples»).
 */
import * as fb from './firebase-sdk.js';
import { AppError } from './domain/common.js';


const CFG = window.SC_CONFIG || {};
const P = 'sc_';
// Entidades del objeto `d` y su colección. `ces`: solo CESANTONI puede leerla (las reglas la niegan a Bodega).
export const SPEC = [
  { key: 'requests', col: 'solicitudes', map: true },
  { key: 'inventory', col: 'inventario', map: true },
  { key: 'shipments', col: 'envios', map: true },
  { key: 'files', col: 'archivos', map: true },
  { key: 'operations', col: 'operaciones', map: true },
  { key: 'reservations', col: 'reservas' },
  { key: 'movements', col: 'movimientos' },
  { key: 'evidence', col: 'evidencias' },
  { key: 'statusHistory', col: 'historial' },
  { key: 'events', col: 'eventos' },
  { key: 'shippingCosts', col: 'costos', map: true, ces: true },
  { key: 'duplicateDecisions', col: 'duplicados', map: true, ces: true },
  { key: 'emails', col: 'correos', ces: true },
  { key: 'notices', col: 'avisos', ces: true },
  { key: 'invoices', col: 'facturas', ces: true },
  { key: 'syncLog', col: 'sync', ces: true },
  { key: 'sheetOutbox', col: 'salida', ces: true },
];
const SINGLES = [{ key: 'settings', id: 'ajustes' }, { key: 'physicalInventory', id: 'fisico', field: 'rows' }, { key: 'meta', id: 'meta' }];
const CHUNK = 700000;
const OVERLAP = 10 * 60 * 1000; // margen por diferencias de reloj entre equipos

export const empty = () => ({
  meta: { lastSync: null, source: null }, requests: {}, inventory: {}, physicalInventory: [], reservations: [], movements: [], evidence: [],
  files: {}, shipments: {}, statusHistory: [], events: [], emails: [], notices: [], invoices: [], shippingCosts: {}, duplicateDecisions: {},
  operations: {}, sheetOutbox: [], syncLog: [], settings: null,
});
const clone = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const docId = (id) => String(id).replace(/\//g, '_');

export class Store {
  constructor() { this.d = empty(); this.ver = {}; this.since = {}; this.loadedAt = 0; this.area = null; this.uid = null; }
  init(app) { this.app = app; this.auth = fb.getAuth(app); this.db = fb.getFirestore(app); return this; }
  get data() { return this.d; }
  ref(col, id) { return fb.doc(this.db, P + col, docId(id)); }
  colRef(col) { return fb.collection(this.db, P + col); }
  readable(s) { return !s.ces || this.area === 'CESANTONI'; }

  // ---------- lectura incremental ----------
  async refresh(force = false) {
    if (!force && Date.now() - this.loadedAt < 4000) return;
    const started = Date.now();
    await Promise.all(SPEC.filter((s) => this.readable(s)).map(async (s) => {
      const since = this.since[s.col];
      const q = since ? fb.query(this.colRef(s.col), fb.where('_u', '>', since - OVERLAP)) : this.colRef(s.col);
      const snap = await fb.getDocs(q);
      for (const doc of snap.docs) this.absorb(s, doc.id, doc.data());
      this.since[s.col] = started;
    }));
    if (this.area === 'CESANTONI') {
      const since = this.since.contactos;
      const q = since ? fb.query(this.colRef('contactos'), fb.where('_u', '>', since - OVERLAP)) : this.colRef('contactos');
      for (const doc of (await fb.getDocs(q)).docs) { this.contacts[doc.id] = doc.data().email || ''; this.vers('contactos')[doc.id] = doc.data()._v || 0; }
      this.since.contactos = started;
      const qa = this.since.archivosf ? fb.query(this.colRef('facturas_archivos'), fb.where('_u', '>', this.since.archivosf - OVERLAP)) : this.colRef('facturas_archivos');
      for (const doc of (await fb.getDocs(qa)).docs) this.absorb({ key: 'files', col: 'facturas_archivos', map: true }, doc.id, doc.data());
      this.since.archivosf = started;
    }
    for (const r of Object.values(this.d.requests)) if (this.contacts[r.requestNo] !== undefined) r.customer.email = this.contacts[r.requestNo];
    await Promise.all(SINGLES.map(async (s) => {
      const snap = await fb.getDoc(this.ref('config', s.id));
      if (!snap.exists()) return;
      const { _v, _u, ...data } = snap.data();
      this.vers('config')[s.id] = _v || 0;
      this.d[s.key] = s.field ? data[s.field] || [] : data;
    }));
    this.loadedAt = Date.now();
  }
  get contacts() { return (this._contacts = this._contacts || {}); }
  vers(col) { return (this.ver[col] = this.ver[col] || {}); }
  absorb(s, id, raw) {
    const { _v, _u, ...data } = raw;
    this.vers(s.col)[id] = _v || 0;
    if (s.map) { this.d[s.key][id] = data; return; }
    const arr = this.d[s.key];
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) arr[i] = data; else arr.push(data);
    if (s.key === 'events' || s.key === 'movements' || s.key === 'statusHistory') arr.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  // ---------- escritura transaccional ----------
  snapshot() {
    const snap = new Map();
    for (const s of SPEC) {
      const v = this.d[s.key];
      if (s.map) for (const [id, x] of Object.entries(v)) snap.set(`${s.key}\u0000${id}`, JSON.stringify(x));
      else for (const x of v) if (x.id) snap.set(`${s.key}\u0000${x.id}`, JSON.stringify(x));
    }
    for (const s of SINGLES) snap.set(`single\u0000${s.key}`, JSON.stringify(this.d[s.key]));
    return snap;
  }
  changes(before) {
    const out = [];
    for (const s of SPEC) {
      const v = this.d[s.key];
      const entries = s.map ? Object.entries(v) : v.map((x) => { if (!x.id) x.id = 'OUT-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10); return [x.id, x]; });
      for (const [id, x] of entries) {
        const json = JSON.stringify(x);
        if (before.get(`${s.key}\u0000${id}`) !== json) {
          let col = s.col;
          if (s.key === 'files' && x.category === 'INVOICE') col = 'facturas_archivos';
          out.push({ col, id, data: clone(x), isNew: !before.has(`${s.key}\u0000${id}`), key: s.key });
        }
      }
    }
    for (const s of SINGLES) {
      if (before.get(`single\u0000${s.key}`) !== JSON.stringify(this.d[s.key])) out.push({ col: 'config', id: s.id, data: s.field ? { [s.field]: clone(this.d[s.key]) } : clone(this.d[s.key]), isNew: !this.vers('config')[s.id] });
    }
    return out;
  }

  // Ejecuta `fn(d)` y guarda lo que cambió. Si otra sesión modificó esos registros, recarga y reintenta.
  async mutate(fn, action = 'CHANGE') {
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = this.snapshot();
      const backup = clone(this.d);
      let result;
      try { result = fn(this.d); } catch (e) { this.d = backup; this.restoreContacts(); throw e; }
      const ch = this.changes(before);
      if (!ch.length) return result;
      // Datos de contacto del cliente: van aparte (sc_contactos), solo los lee CESANTONI.
      for (const c of ch.filter((x) => x.key === 'requests')) {
        const email = c.data.customer ? c.data.customer.email : undefined;
        if (c.data.customer) delete c.data.customer.email;
        if (this.area === 'CESANTONI' && email !== undefined && email !== this.contacts[c.id]) ch.push({ col: 'contactos', id: c.id, data: { email }, isNew: this.vers('contactos')[c.id] === undefined, contact: true });
      }
      const now = Date.now();
      try {
        await fb.runTransaction(this.db, async (tx) => {
          const snaps = await Promise.all(ch.map((c) => tx.get(this.ref(c.col, c.id))));
          snaps.forEach((snap, i) => {
            const c = ch[i];
            const known = this.vers(c.col)[c.id];
            const current = snap.exists() ? snap.data()._v || 0 : undefined;
            if (current !== known && !(current === undefined && known === undefined)) throw new AppError(409, 'STALE', 'conflict');
          });
          ch.forEach((c) => { c.v = (this.vers(c.col)[c.id] || 0) + 1; tx.set(this.ref(c.col, c.id), { ...c.data, _v: c.v, _u: now }); });
          tx.set(this.ref('seguridad', `${now.toString(36)}-${Math.random().toString(16).slice(2, 10)}`), { uid: this.uid, area: this.area, action, at: new Date(now).toISOString(), _u: now });
        });
        ch.forEach((c) => { this.vers(c.col)[c.id] = c.v; if (c.contact) this.contacts[c.id] = c.data.email; });
        return result;
      } catch (e) {
        this.d = backup; this.restoreContacts();
        if (e.code === 'STALE' || e.code === 'aborted' || e.code === 'failed-precondition') { await this.refresh(true); continue; }
        throw translate(e);
      }
    }
    throw new AppError(409, 'BUSY', 'Otra persona está modificando este registro. Inténtalo de nuevo.');
  }
  restoreContacts() { for (const r of Object.values(this.d.requests)) if (this.contacts[r.requestNo] !== undefined) r.customer.email = this.contacts[r.requestNo]; }

  // ---------- archivos (guardados por partes, como en proveedores y movimientos) ----------
  async putFile(meta, base64) {
    const col = meta.category === 'INVOICE' ? 'facturas_archivos' : 'archivos';
    const partes = Math.max(1, Math.ceil(base64.length / CHUNK));
    const now = Date.now();
    for (let i = 0; i < partes; i++) await fb.setDoc(fb.doc(this.db, P + col, meta.id, 'partes', String(i).padStart(3, '0')), { d: base64.slice(i * CHUNK, (i + 1) * CHUNK) });
    await fb.setDoc(this.ref(col, meta.id), { ...meta, partes, _v: 1, _u: now });
    this.vers(col)[meta.id] = 1;
    this.d.files[meta.id] = { ...meta, partes };
    return this.d.files[meta.id];
  }
  async fileBlob(id) {
    this.blobs = this.blobs || new Map();
    if (this.blobs.has(id)) return this.blobs.get(id);
    const meta = this.d.files[id];
    if (!meta) throw new AppError(404, 'FILE_NOT_FOUND', 'Archivo no encontrado');
    const col = meta.category === 'INVOICE' ? 'facturas_archivos' : 'archivos';
    const snap = await fb.getDocs(fb.collection(this.db, P + col, id, 'partes'));
    const b64 = snap.docs.sort((a, b) => a.id.localeCompare(b.id)).map((x) => x.data().d).join('');
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: meta.mime });
    this.blobs.set(id, blob);
    return blob;
  }
}

// Mensajes claros en lugar de códigos de Firebase.
export function translate(e) {
  if (e instanceof AppError) return e;
  const m = {
    'permission-denied': [403, 'FORBIDDEN', 'Your profile does not have access to this function'],
    unavailable: [503, 'OFFLINE', 'Sin conexión con la base de datos. Revisa tu internet e inténtalo de nuevo.'],
    'resource-exhausted': [429, 'QUOTA', 'Se alcanzó el límite diario de la base de datos. Inténtalo más tarde.'],
  }[e && e.code];
  if (m) return new AppError(...m);
  console.warn('Detalle técnico:', e);
  return new AppError(500, 'SERVER_ERROR', (e && e.message) || 'Error inesperado');
}

// Id determinista para correos con clave de operación: dos envíos de la misma operación chocan y no se duplican.
export { emailIdFor } from './domain/common.js';
export { CFG };
