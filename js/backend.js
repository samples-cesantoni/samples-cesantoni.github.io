/* Samples Center · "servidor" en el navegador.
 * Atiende las mismas rutas /api que la versión Node, sobre Firebase Authentication + Firestore (colecciones sc_).
 * Las pantallas solo deciden qué mostrar; quién puede leer o escribir cada dato lo deciden las reglas de Firestore.
 */
import * as fb from './firebase-sdk.js';
import { Store, translate, CFG } from './store.js';
import { AppError, logEvent, getRequest } from './domain/common.js';
import * as C from './domain/catalog.js';
import * as views from './domain/views.js';
import * as inventory from './domain/inventory.js';
import * as evidence from './domain/evidence.js';
import * as status from './domain/status.js';
import * as notices from './domain/notices.js';
import { computeAlerts } from './domain/alerts.js';
import { findDuplicates } from './domain/duplicates.js';
import * as finance from './domain/finance.js';
import * as analytics from './domain/analytics.js';
import { timeCtx } from './domain/metrics.js';
import { norm, parseRequests, parseTracking, parseCatalog, parseOperation, parseInventoryMoves } from './domain/sheet-parse.js';
import { applySourceSnapshot } from './domain/sync.js';
import { localParts } from './domain/time.js';
import { EMAIL_RE } from './domain/email.js';

const TZ = 'America/Mexico_City';
const MAX_UPLOAD = 5 * 1024 * 1024; // como en proveedores/movimientos: los archivos se guardan por partes en Firestore
const store = new Store();
let app = null; let me = null;

const ctx = {
  store: { get data() { return store.d; }, tx: (fn) => fn(store.d), fileBlob: (id) => store.fileBlob(id) },
  config: { timeZone: TZ, email: {} },
  settings: () => {
    const s = store.d.settings || {};
    const D = C.DEFAULT_SETTINGS;
    return { ...D, ...s, businessHours: { ...D.businessHours, ...(s.businessHours || {}) }, targets: { ...D.targets, ...(s.targets || {}) }, carriers: { ...D.carriers, ...(s.carriers || {}) }, emailMode: s.emailMode || 'TEST', testRecipient: s.testRecipient || '' };
  },
};

// ---------------------------------------------------------------- arranque y sesión
export async function init() {
  if (app) return;
  if (!(CFG.firebase && CFG.firebase.apiKey)) throw new Error('Falta la configuración de Firebase (js/config.js).');
  app = fb.initializeApp(CFG.firebase, 'samples');
  store.init(app);
  if (CFG.emulator) {
    fb.connectAuthEmulator(store.auth, 'http://' + CFG.emulator.auth, { disableWarnings: true });
    const [h, p] = CFG.emulator.firestore.split(':'); fb.connectFirestoreEmulator(store.db, h, Number(p));
  }
  await new Promise((ok) => { const off = fb.onAuthStateChanged(store.auth, () => { off(); ok(); }); });
}
const areaOf = (rol) => (rol === 'bodega' ? 'BODEGA' : 'CESANTONI');
async function loadMe() {
  const u = store.auth.currentUser;
  if (!u) return null;
  let a = await fb.getDoc(store.ref('admins', u.uid)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
  if (!a) {
    // Invitación: alguien con cuenta en otra plataforma (proveedores, movimientos) entra con su misma contraseña.
    const email = String(u.email || '').toLowerCase();
    const inv = await fb.getDoc(store.ref('invitaciones', email)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
    if (inv) {
      const t = new Date().toISOString();
      await fb.setDoc(store.ref('admins', u.uid), { correo: email, rol: inv.rol, activo: true, cambiar_clave: false, creado_en: t, ultimo_acceso: t, invitacion: email });
      await fb.deleteDoc(store.ref('invitaciones', email)).catch(() => null);
      a = { correo: email, rol: inv.rol, activo: true };
    }
  }
  if (!a || a.activo === false) return null;
  me = { uid: u.uid, ...a };
  store.area = areaOf(a.rol); store.uid = u.uid;
  return me;
}
export async function state() {
  const inicio = await fb.getDoc(store.ref('config', 'inicio')).then((s) => s.exists()).catch(() => true);
  return { hasAdmin: inicio, signedIn: Boolean(store.auth.currentUser) };
}
const claveOk = (p) => String(p || '').length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
export async function firstAdmin(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  if (!EMAIL_RE.test(correo)) throw new AppError(400, 'EMAIL', 'Escribe un correo válido.');
  if (!claveOk(clave)) throw new AppError(400, 'PASSWORD', 'La contraseña debe tener al menos 10 caracteres, con letras y números.');
  if ((await state()).hasAdmin) throw new AppError(409, 'HAS_ADMIN', 'La plataforma ya tiene administrador. Inicia sesión.');
  let cred;
  try { cred = await fb.createUserWithEmailAndPassword(store.auth, correo, clave); }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; cred = await fb.signInWithEmailAndPassword(store.auth, correo, clave); }
  const t = new Date().toISOString(); const b = fb.writeBatch(store.db);
  b.set(store.ref('admins', cred.user.uid), { correo, rol: 'admin', activo: true, cambiar_clave: false, creado_en: t, ultimo_acceso: t });
  b.set(store.ref('config', 'inicio'), { creado_en: t, por: cred.user.uid });
  await b.commit();
  return loadMe();
}
export async function signIn(correo, clave) {
  correo = String(correo || '').trim().toLowerCase();
  try { await fb.signInWithEmailAndPassword(store.auth, correo, clave); }
  catch (e) {
    if (e.code === 'auth/too-many-requests') throw new AppError(429, 'LOCKED', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
    if (e.code === 'auth/network-request-failed') throw new AppError(503, 'OFFLINE', 'Sin conexión. Revisa tu internet.');
    throw new AppError(401, 'INVALID', 'Correo o contraseña incorrectos.');
  }
  if (!(await loadMe())) { await fb.signOut(store.auth).catch(() => null); throw new AppError(403, 'NO_ACCESS', 'Esta cuenta no tiene acceso a Samples. Pide a un administrador de CESANTONI que te dé de alta.'); }
  await fb.updateDoc(store.ref('admins', me.uid), { ultimo_acceso: new Date().toISOString() }).catch(() => null);
  return me;
}
export async function resetPassword(correo) {
  correo = String(correo || '').trim().toLowerCase();
  if (EMAIL_RE.test(correo)) await fb.sendPasswordResetEmail(store.auth, correo, { url: location.href.split('#')[0] }).catch(() => null);
}
export async function changePassword(actual, nueva) {
  if (!claveOk(nueva)) throw new AppError(400, 'PASSWORD', 'La contraseña debe tener al menos 10 caracteres, con letras y números.');
  try { await fb.reauthenticateWithCredential(store.auth.currentUser, fb.EmailAuthProvider.credential(store.auth.currentUser.email, actual)); }
  catch { throw new AppError(400, 'PASSWORD', 'La contraseña actual no es correcta.'); }
  await fb.updatePassword(store.auth.currentUser, nueva);
  await fb.updateDoc(store.ref('admins', me.uid), { cambiar_clave: false });
  me.cambiar_clave = false;
}
export async function signOut() { me = null; store.area = null; store.d = store.d && (await import('./store.js')).empty(); store.since = {}; store.ver = {}; store._contacts = {}; await fb.signOut(store.auth); }
export async function restore() { return store.auth.currentUser ? loadMe() : null; }
export const currentUser = () => me;
export const fileBlob = (id) => store.fileBlob(id);

// ---------------------------------------------------------------- correos (Gmail por Apps Script, respaldo EmailJS)
async function viaGmail(to, e) {
  if (!(CFG.correo && /^https:\/\//.test(CFG.correo.url || ''))) throw new Error('Gmail no configurado');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(CFG.correo.url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: await store.auth.currentUser.getIdToken(), to, subject: e.subject, html: e.html, text: e.text, proveedor_id: '' }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || 'respuesta ' + r.status);
  } finally { clearTimeout(t); }
}
async function viaEmailJS(to, e) {
  const x = CFG.emailjs || {};
  if (!(x.publicKey && x.serviceId && x.templateId)) throw new Error('EmailJS no configurado');
  const r = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: x.serviceId, template_id: x.templateId, user_id: x.publicKey, template_params: { to_email: to, subject: e.subject, html: e.html, message: e.text } }) });
  if (!r.ok) throw new Error('EmailJS respondió ' + r.status);
}
const providerReady = () => Boolean((CFG.correo && CFG.correo.url) || (CFG.emailjs && CFG.emailjs.publicKey));
// Un correo solo queda "SENT" cuando el servicio de correo confirma el envío.
async function dispatch(emailId) {
  const e = store.d.emails.find((x) => x.id === emailId);
  if (!e || e.status === 'SENT') return e;
  const s = ctx.settings();
  let to = e.to;
  const block = (reason) => store.mutate((d) => { const x = d.emails.find((y) => y.id === emailId); x.status = 'QUEUED'; x.statusReason = reason; }, 'EMAIL_BLOCKED');
  if (s.emailMode !== 'PRODUCTION') {
    if (!EMAIL_RE.test(s.testRecipient || '')) { await block('TEST mode: no test recipient configured — not sent'); return e; }
    to = s.testRecipient;
  }
  if (!providerReady()) { await block('No email service configured — not sent'); return e; }
  const html = e.html.replace(/cid:cesantoniLogo/g, new URL('assets/logo-cesantoni.png', location.href).href);
  const subject = s.emailMode === 'PRODUCTION' ? e.subject : `[TEST] ${e.subject}`;
  const errors = []; let via = '';
  for (const [name, fn] of [['gmail', viaGmail], ['emailjs', viaEmailJS]]) {
    try { await fn(to, { subject, html, text: e.text }); via = name; break; } catch (err) { errors.push(`${name}: ${err.name === 'AbortError' ? 'no response' : err.message}`); }
  }
  await store.mutate((d) => {
    const x = d.emails.find((y) => y.id === emailId);
    x.attempts = (x.attempts || 0) + 1;
    if (via) {
      Object.assign(x, { status: 'SENT', statusReason: '', error: '', sentAt: new Date().toISOString(), providerId: via, deliveredTo: s.emailMode === 'PRODUCTION' ? 'CUSTOMER' : 'TEST_RECIPIENT' });
      for (const no of x.requestNos) logEvent(d, { requestNo: no, event: `Customer notification sent${s.emailMode === 'PRODUCTION' ? '' : ' (test recipient)'}`, area: 'SYSTEM' });
    } else {
      Object.assign(x, { status: 'FAILED', error: errors.join(' · ').slice(0, 300) });
      for (const no of x.requestNos) logEvent(d, { requestNo: no, event: 'Customer notification failed', area: 'SYSTEM' });
    }
    d.sheetOutbox.push({ kind: 'EMAIL_LOG', emailId: x.id, at: new Date().toISOString() });
  }, 'EMAIL_RESULT');
  return store.d.emails.find((y) => y.id === emailId);
}

// ---------------------------------------------------------------- archivos
const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? 'image/jpeg'
  : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
    : b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? 'application/pdf' : null);
async function uploadFile(form) {
  const file = form.get('file');
  if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Select a file');
  if (file.size > MAX_UPLOAD) throw new AppError(413, 'FILE_TOO_LARGE', 'File exceeds 5 MB');
  const category = form.get('category') === 'INVOICE' ? 'INVOICE' : 'EVIDENCE';
  if (category === 'INVOICE' && me.rol === 'bodega') throw new AppError(403, 'FORBIDDEN', 'Invoices are restricted to CESANTONI');
  const buf = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) throw new AppError(415, 'UNSUPPORTED_FILE', 'Only JPEG, PNG or PDF files are accepted');
  if (category === 'INVOICE' && mime !== 'application/pdf') throw new AppError(415, 'PDF_REQUIRED', 'Invoices must be PDF files');
  const requestNo = category === 'EVIDENCE' ? String(form.get('requestNo') || '') : null;
  if (category === 'EVIDENCE') getRequest(store.d, requestNo);
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (x) => x.toString(16).padStart(2, '0')).join('');
  const id = `FIL-${crypto.randomUUID()}`;
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' }[mime];
  const safe = String(file.name || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\.[^.]+$/, '').slice(0, 60) || 'file';
  const meta = { id, name: `${requestNo ? requestNo + '_' : ''}${safe}.${ext}`, mime, size: file.size, sha256: digest, category, requestNo, uploadedAt: new Date().toISOString(), area: store.area };
  try { await store.putFile(meta, btoa(bin)); } catch (e) { throw translate(e); }
  return { file: { id, name: meta.name, mime, size: file.size } };
}

// ---------------------------------------------------------------- importación de la exportación .xlsx (respaldo de la sincronización)
async function importWorkbook(form) {
  const { excel } = await import('./services/exports.js');
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await form.get('file').arrayBuffer());
  const rowsOf = (name) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new AppError(400, 'SHEET_MISSING', `Sheet "${name}" not found in the workbook`);
    const val = (v) => (v === null || v === undefined ? '' : v instanceof Date ? v : typeof v === 'object' ? ('result' in v ? val(v.result) : v.richText ? v.richText.map((t) => t.text).join('') : v.text || '') : v);
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => { const a = []; for (let c = 1; c <= Math.max(ws.columnCount, row.cellCount); c++) a.push(val(row.getCell(c).value)); rows[n - 1] = a; });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    return rows;
  };
  const optional = (name, fn) => (wb.getWorksheet(name) ? fn(rowsOf(name)) : []);
  const snap = {
    requests: parseRequests(rowsOf('REQUESTS'), TZ), tracking: parseTracking(rowsOf('TRACKING'), TZ), catalog: parseCatalog(rowsOf('PRODUCTS')),
    operation: optional('OPERATION DATA', parseOperation), moves: optional('MOVIMIENTOS INVENTARIO', (r) => parseInventoryMoves(r, TZ)),
  };
  return store.mutate((d) => applySourceSnapshot(d, snap, `Import: ${form.get('file').name}`), 'IMPORT');
}

// ---------------------------------------------------------------- usuarios por área
async function listUsers() {
  const [a, inv] = await Promise.all([fb.getDocs(store.colRef('admins')), fb.getDocs(store.colRef('invitaciones'))]);
  return {
    users: a.docs.map((x) => ({ uid: x.id, correo: x.data().correo, rol: x.data().rol, activo: x.data().activo !== false, ultimo_acceso: x.data().ultimo_acceso || '', me: x.id === me.uid })),
    invitations: inv.docs.map((x) => ({ correo: x.id, rol: x.data().rol })),
  };
}
async function saveUser(b) {
  if (me.rol !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede dar de alta usuarios.');
  const rol = ['admin', 'cesantoni', 'bodega'].includes(b.rol) ? b.rol : 'bodega';
  if (b.uid) {
    if (b.uid === me.uid && (b.activo === false || rol !== 'admin')) throw new AppError(400, 'SELF', 'No puedes quitarte el rol ni desactivarte.');
    await fb.updateDoc(store.ref('admins', b.uid), { rol, activo: b.activo !== false });
    return listUsers();
  }
  const correo = String(b.correo || '').trim().toLowerCase();
  if (!EMAIL_RE.test(correo)) throw new AppError(400, 'EMAIL', 'Escribe un correo válido.');
  if (!claveOk(b.password)) throw new AppError(400, 'PASSWORD', 'Contraseña temporal: al menos 10 caracteres, con letras y números.');
  const app2 = fb.initializeApp(CFG.firebase, 'alta-' + Date.now()); const a2 = fb.getAuth(app2);
  if (CFG.emulator) fb.connectAuthEmulator(a2, 'http://' + CFG.emulator.auth, { disableWarnings: true });
  let uid = '';
  try { uid = (await fb.createUserWithEmailAndPassword(a2, correo, b.password)).user.uid; }
  catch (e) { if (e.code !== 'auth/email-already-in-use') throw e; }
  finally { await fb.signOut(a2).catch(() => null); }
  const t = new Date().toISOString();
  if (uid) await fb.setDoc(store.ref('admins', uid), { correo, rol, activo: true, cambiar_clave: true, creado_en: t, ultimo_acceso: '' });
  else await fb.setDoc(store.ref('invitaciones', correo), { rol, creado_en: t });
  return listUsers();
}

// ---------------------------------------------------------------- rutas /api
const ROUTES = [];
const on = (method, pattern, fn, opts = {}) => ROUTES.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$'), fn, ...opts });
const ces = { ces: true };

on('GET', '/session', () => {
  const s = ctx.settings();
  return {
    area: store.area, rol: me.rol, mustChangePassword: Boolean(me.cambiar_clave), appMode: 'FIREBASE', timeZone: TZ,
    email: { provider: providerReady() ? 'GMAIL_APPS_SCRIPT' : 'NONE', mode: s.emailMode, testRecipientSet: EMAIL_RE.test(s.testRecipient || ''), live: providerReady() && (s.emailMode === 'PRODUCTION' || EMAIL_RE.test(s.testRecipient || '')) },
    sync: { configured: true, enabled: true, writeEnabled: true, lastSync: store.d.meta?.lastSync || null, source: store.d.meta?.source || null },
  };
});
on('GET', '/meta', () => {
  const carriers = Object.fromEntries(Object.entries(ctx.settings().carriers).map(([k, v]) => [k, { name: v.name, hasTrackingUrl: Boolean(v.trackingUrl) }]));
  return { statuses: C.STATUSES, statusLabel: C.STATUS_LABEL, stages: C.STAGES, stageLabel: C.STAGE_LABEL, evidenceLabel: C.EVIDENCE_LABEL, deliveryModes: C.DELIVERY_MODES, carriers, noticeCategories: C.NOTICE_CATEGORIES, noticeLabel: C.NOTICE_LABEL, reports: analytics.REPORTS.map(([id, title]) => ({ id, title })) };
});

on('GET', '/requests', (q) => {
  const term = norm(q.q || '');
  const tc = timeCtx(ctx);
  let list = Object.values(store.d.requests).map((x) => views.summary(ctx, x, store.area, tc));
  if (term) list = list.filter((s) => [s.requestNo, s.customerName, s.company, s.country, s.state, s.city, ...s.models, ...s.skus, s.trackingNo, store.area === 'CESANTONI' ? s.customerEmail : ''].some((v) => norm(v).includes(term)) || (s.createdAt && localParts(new Date(s.createdAt), TZ).iso.includes(q.q)));
  if (q.status) list = list.filter((s) => s.status === q.status);
  if (q.light) list = list.filter((s) => s.light === q.light);
  if (q.mode) list = list.filter((s) => (q.mode === 'NONE' ? !s.deliveryMode : s.deliveryMode === q.mode));
  if (q.country) list = list.filter((s) => s.country === q.country);
  if (q.state) list = list.filter((s) => s.state === q.state);
  if (q.from) list = list.filter((s) => s.createdAt && localParts(new Date(s.createdAt), TZ).iso >= q.from);
  if (q.to) list = list.filter((s) => s.createdAt && localParts(new Date(s.createdAt), TZ).iso <= q.to);
  if (q.active === '1') list = list.filter((s) => !C.FINAL_STATUSES.includes(s.status));
  list.sort((a, b) => b.requestNo.localeCompare(a.requestNo, 'en', { numeric: true }));
  return { requests: list, options: { countries: [...new Set(list.map((s) => s.country).filter(Boolean))].sort(), states: [...new Set(list.map((s) => s.state).filter(Boolean))].sort() } };
});
on('GET', '/requests/:no', (q, b, [no]) => views.detail(ctx, getRequest(store.d, no), store.area));
on('POST', '/requests/:no/observations', (q, b, [no]) => {
  const text = String(b.text || '').trim();
  if (text.length < 2) throw new AppError(400, 'TEXT_REQUIRED', 'Write the observation');
  return store.mutate((d) => {
    const rq = getRequest(d, no);
    const o = { id: `OBS-${Date.now().toString(36)}`, at: new Date().toISOString(), area: store.area === 'BODEGA' ? 'Warehouse' : 'CESANTONI', text: text.slice(0, 1000) };
    (rq.observations = rq.observations || []).push(o);
    logEvent(d, { requestNo: no, event: 'Observation added', area: store.area });
    return o;
  }, 'OBSERVATION');
});
on('POST', '/requests/:no/delivery-mode', (q, b, [no]) => store.mutate((d) => status.setDeliveryMode(d, no, b.mode, 'CESANTONI'), 'DELIVERY_MODE').then((r) => ({ ok: true, deliveryMode: r.request.deliveryMode })), ces);
on('GET', '/requests/:no/dossier.pdf', async (q, b, [no]) => {
  const financial = q.financial === '1';
  if (financial && store.area !== 'CESANTONI') throw new AppError(403, 'FORBIDDEN', 'Financial version is restricted to CESANTONI');
  const det = views.detail(ctx, getRequest(store.d, no), financial ? 'CESANTONI' : 'BODEGA');
  const { buildDossier } = await import('./services/dossier.js');
  return { blob: await buildDossier(ctx, det, { size: q.size === 'A4' ? 'A4' : 'LETTER', financial }), name: `${no}_Evidence_Report${financial ? '_Internal' : ''}.pdf` };
});

on('GET', '/inventory', (q) => {
  const term = norm(q.q || '');
  let items = inventory.listItems(store.d);
  if (term) items = items.filter((i) => [i.sku, i.model, i.color, i.format, i.formLabel].some((v) => norm(v).includes(term)));
  if (q.location) items = items.filter((i) => norm(i.location).startsWith(norm(q.location)) || norm(i.backupLocation).startsWith(norm(q.location)));
  if (q.state) items = items.filter((i) => i.state === q.state);
  items.sort((a, b) => a.model.localeCompare(b.model) || a.color.localeCompare(b.color));
  let physical = store.d.physicalInventory || [];
  if (term) physical = physical.filter((p) => [p.model, p.color, p.finish].some((v) => norm(v).includes(term)));
  if (q.location) physical = physical.filter((p) => norm(`Mueble ${p.cabinet}`).startsWith(norm(q.location)));
  const locations = [...new Set(Object.values(store.d.inventory).map((i) => (i.location || '').split('·')[0].trim()).filter(Boolean))].sort();
  return { items, physical, locations };
});
on('GET', '/inventory/movements', (q) => ({
  movements: store.d.movements.filter((m) => !q.itemId || m.itemId === q.itemId).slice().sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-300).reverse()
    .map((m) => ({ ...m, area: m.area === 'BODEGA' ? 'Warehouse' : m.area, item: store.d.inventory[m.itemId] ? `${store.d.inventory[m.itemId].model} · ${store.d.inventory[m.itemId].color}` : [m.model, m.color].filter(Boolean).join(' · ') || m.itemId })),
}));
on('POST', '/inventory/adjust', (q, b) => store.mutate((d) => inventory.adjustStock(d, b, store.area), 'INVENTORY_ADJUST'), ces);
on('POST', '/requests/:no/inventory-exclusion', (q, b, [no]) => store.mutate((d) => { const r = inventory.setInventoryExclusion(d, no, b.excluded); inventory.reconcileInventory(d); return r; }, 'INVENTORY_EXCLUSION'), ces);
for (const op of ['reserve', 'release', 'issue']) on('POST', `/inventory/${op}`, (q, b) => store.mutate((d) => inventory[op](d, b, store.area), `INVENTORY_${op.toUpperCase()}`));

on('POST', '/files', (q, b, p, form) => uploadFile(form));
on('POST', '/evidence', (q, b) => store.mutate((d) => evidence.addEvidence(d, b, store.area), 'EVIDENCE_ADD'));
// Bulk upload: which operation keys were already saved (the same photo is never uploaded twice).
on('POST', '/evidence/known', (q, b) => ({ known: (b.keys || []).filter((k) => store.d.operations[k]) }));
on('POST', '/evidence/:id/review', (q, b, [id]) => store.mutate((d) => evidence.reviewEvidence(d, { ...b, evidenceId: id }, 'CESANTONI'), 'EVIDENCE_REVIEW'), ces);
on('GET', '/validation', (q) => {
  const st = q.state || 'PENDING';
  const list = store.d.evidence.filter((e) => !e.supersededBy && (st === 'ALL' || e.state === st)).map((e) => ({ ...e, typeLabel: C.EVIDENCE_LABEL[e.type], stageLabel: C.STAGE_LABEL[e.stage], file: views.fileView(store.d, e.fileId), company: store.d.requests[e.requestNo]?.customer.company, area: e.area === 'BODEGA' ? 'Warehouse' : e.area }));
  list.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  return { evidence: list };
}, ces);
on('PUT', '/requests/:no/shipment', (q, b, [no]) => store.mutate((d) => evidence.setShipment(d, ctx.settings(), no, b, store.area), 'SHIPMENT'));

on('POST', '/status/preview', (q, b) => status.previewChange({ ...ctx, config: { ...ctx.config, email: { mode: ctx.settings().emailMode, provider: providerReady() ? 'GMAIL' : 'NONE' } } }, b), ces);
on('POST', '/status/change', async (q, b) => {
  const out = await store.mutate(() => status.changeStatus({ ...ctx, store: { ...ctx.store, tx: (fn) => fn(store.d) } }, b), 'STATUS_CHANGE');
  let email = null;
  if (out.emailId) { const e = await dispatch(out.emailId); email = { id: e.id, status: e.status, statusReason: e.statusReason, error: e.error }; }
  return { ...out, email };
}, ces);

on('GET', '/emails', (q) => ({ emails: store.d.emails.filter((e) => !q.status || e.status === q.status).map(({ html, text, ...e }) => e).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) }), ces);
on('GET', '/emails/:id', (q, b, [id]) => {
  const e = store.d.emails.find((x) => x.id === id);
  if (!e) throw new AppError(404, 'EMAIL_NOT_FOUND', 'Email not found');
  return { ...e, html: e.html.replace(/cid:cesantoniLogo/g, 'assets/logo-cesantoni.png') };
}, ces);
on('POST', '/emails/:id/retry', async (q, b, [id]) => {
  const e = store.d.emails.find((x) => x.id === id);
  if (!e) throw new AppError(404, 'EMAIL_NOT_FOUND', 'Email not found');
  if (e.status === 'SENT') throw new AppError(409, 'ALREADY_SENT', 'This email was already sent');
  const out = await dispatch(id);
  return { id: out.id, status: out.status, statusReason: out.statusReason, error: out.error };
}, ces);

on('GET', '/notices', () => ({ notices: store.d.notices.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((n) => ({ ...n, emails: store.d.emails.filter((e) => e.noticeId === n.id).map(({ id, to, status: s, requestNos }) => ({ id, to, status: s, requestNos })) })) }), ces);
on('POST', '/notices/preview', (q, b) => notices.previewNotice(ctx, b), ces);
on('POST', '/notices', async (q, b) => {
  const out = await store.mutate(() => notices.createNotice({ ...ctx, store: { ...ctx.store, tx: (fn) => fn(store.d) } }, b, 'CESANTONI'), 'NOTICE_CREATE');
  const results = [];
  for (const id of out.emailIds || []) { const e = await dispatch(id); results.push({ id: e.id, to: e.to, status: e.status, statusReason: e.statusReason, error: e.error }); }
  return { notice: out.notice, emails: results };
}, ces);
on('POST', '/notices/:id/stop-reminders', (q, b, [id]) => store.mutate((d) => notices.stopReminders(d, id, 'CESANTONI'), 'NOTICE_STOP'), ces);
on('POST', '/notices/:id/cancel', (q, b, [id]) => store.mutate((d) => notices.cancelNotice(d, id, 'CESANTONI'), 'NOTICE_CANCEL'), ces);

on('GET', '/alerts', () => ({ alerts: computeAlerts(ctx, store.area) }));
on('GET', '/duplicates', () => ({ duplicates: findDuplicates(store.d, ctx.settings()) }), ces);
on('POST', '/duplicates/decision', (q, b) => {
  if (!['NOT_DUPLICATE', 'CONFIRMED_DUPLICATE', 'UNDER_REVIEW'].includes(b.decision)) throw new AppError(400, 'INVALID_DECISION', 'Invalid decision');
  return store.mutate((d) => { d.duplicateDecisions[b.key] = { decision: b.decision, notes: String(b.notes || '').slice(0, 500), at: new Date().toISOString(), area: 'CESANTONI' }; logEvent(d, { event: `Duplicate review: ${b.key.replace('|', ' / ')} → ${b.decision}`, area: 'CESANTONI' }); return d.duplicateDecisions[b.key]; }, 'DUPLICATE');
}, ces);

on('GET', '/finance', (q) => finance.financeSummary(store.d, TZ, q), ces);
on('POST', '/invoices', (q, b) => store.mutate((d) => finance.saveInvoice(d, { ...b, id: undefined }, 'CESANTONI'), 'INVOICE_CREATE'), ces);
on('PUT', '/invoices/:id', (q, b, [id]) => store.mutate((d) => finance.saveInvoice(d, { ...b, id }, 'CESANTONI'), 'INVOICE_UPDATE'), ces);
on('PUT', '/requests/:no/cost', (q, b, [no]) => store.mutate((d) => finance.setShippingCost(d, no, b, 'CESANTONI'), 'COST'), ces);

on('GET', '/dashboard', (q) => analytics.dashboard(ctx, q), ces);
on('GET', '/reports/:id', async (q, b, [id]) => {
  const { format = 'json', size, ...filters } = q;
  const rep = analytics.report(ctx, id, filters);
  if (!rep) throw new AppError(404, 'REPORT_NOT_FOUND', 'Report not found');
  if (format === 'json') return rep;
  const ex = await import('./services/exports.js');
  const fname = `CESANTONI_${rep.title.replace(/[^\w]+/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
  if (format === 'csv') return { blob: ex.toCsv(rep), name: `${fname}.csv` };
  if (format === 'xlsx') return { blob: await ex.toXlsx(rep), name: `${fname}.xlsx` };
  if (format === 'pdf') return { blob: await ex.toPdf(rep, { size }), name: `${fname}.pdf` };
  throw new AppError(400, 'INVALID_FORMAT', 'Format must be json, csv, xlsx or pdf');
}, ces);
on('GET', '/activity', (q) => ({ events: store.d.events.filter((e) => !q.requestNo || e.requestNo === q.requestNo).slice(-500).reverse() }), ces);

on('GET', '/settings', () => ctx.settings(), ces);
on('PUT', '/settings', (q, b) => {
  const cur = ctx.settings(); const next = { ...cur };
  if (b.businessHours) {
    const ok = /^\d{2}:\d{2}$/.test(b.businessHours.start) && /^\d{2}:\d{2}$/.test(b.businessHours.end) && b.businessHours.start < b.businessHours.end && Array.isArray(b.businessHours.days);
    if (!ok) throw new AppError(400, 'INVALID_HOURS', 'Invalid business hours');
    next.businessHours = { start: b.businessHours.start, end: b.businessHours.end, days: b.businessHours.days.map(Number).filter((x) => x >= 0 && x <= 6) };
  }
  if (b.holidays) next.holidays = [...new Set(b.holidays.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
  if (b.targets) for (const k of Object.keys(cur.targets)) if (b.targets[k] !== undefined) { const v = Number(b.targets[k]); if (!(v > 0 && v < 1000)) throw new AppError(400, 'INVALID_TARGET', `Invalid target ${k}`); next.targets = { ...next.targets, [k]: v }; }
  if (b.duplicateWindowDays) next.duplicateWindowDays = Math.min(Math.max(Number(b.duplicateWindowDays), 1), 90);
  if (b.carriers) {
    next.carriers = { ...cur.carriers };
    for (const [k, v] of Object.entries(b.carriers)) {
      if (!next.carriers[k]) continue;
      const url = String(v.trackingUrl || '');
      if (url && (!/^https:\/\/[^\s]+$/.test(url) || !url.includes('{n}'))) throw new AppError(400, 'INVALID_URL', `Tracking URL for ${k} must be HTTPS and contain {n}`);
      next.carriers[k] = { ...next.carriers[k], trackingUrl: url };
    }
  }
  if (b.emailMode !== undefined) {
    if (!['TEST', 'PRODUCTION'].includes(b.emailMode)) throw new AppError(400, 'INVALID_MODE', 'Invalid email mode');
    if (b.emailMode === 'PRODUCTION' && me.rol !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Solo un administrador puede activar el envío real a clientes.');
    next.emailMode = b.emailMode;
  }
  if (b.testRecipient !== undefined) {
    if (b.testRecipient && !EMAIL_RE.test(b.testRecipient)) throw new AppError(400, 'EMAIL', 'Invalid test recipient');
    next.testRecipient = b.testRecipient;
  }
  return store.mutate((d) => { d.settings = next; logEvent(d, { event: 'Configuration updated', area: 'CESANTONI' }); }, 'SETTINGS').then(() => ctx.settings());
}, ces);
on('GET', '/sync/log', () => ({ log: store.d.syncLog.slice(-100).reverse(), outbox: { pending: store.d.sheetOutbox.filter((x) => !x.doneAt).length, failed: store.d.sheetOutbox.filter((x) => !x.doneAt && x.attempts).length }, meta: store.d.meta || {} }), ces);
on('POST', '/sync/import', (q, b, p, form) => importWorkbook(form), ces);
on('GET', '/users', () => listUsers(), ces);
on('POST', '/users', (q, b) => saveUser(b), ces);
on('POST', '/password', (q, b) => changePassword(b.actual, b.nueva).then(() => ({ ok: true })));

export async function handle(method, path, { body, form } = {}) {
  if (!me) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in required');
  const [p, qs] = path.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const r = ROUTES.find((x) => x.method === method && x.re.test(p));
  if (!r) throw new AppError(404, 'NOT_FOUND', 'Endpoint not found');
  if (r.ces && store.area !== 'CESANTONI') throw new AppError(403, 'FORBIDDEN', 'Your profile does not have access to this function');
  try {
    await store.refresh(method !== 'GET');
    // The platform keeps the inventory: deduct new requests on arrival, give back cancelled / excluded ones.
    if (store.area === 'CESANTONI' && inventory.needsReconcile(store.d)) await store.mutate((d) => inventory.reconcileInventory(d), 'INVENTORY_AUTO').catch(() => null);
    // Automatic status changes (Warehouse tracking + label, UPS): the customer email goes out automatically.
    if (store.area === 'CESANTONI' && status.pendingAuto(store.d).length) {
      const ids = await store.mutate((d) => status.queueAutoEmails(ctx, d), 'AUTO_EMAIL').catch(() => []);
      for (const id of ids || []) await dispatch(id).catch(() => null); // same TEST / PRODUCTION rules as any other email
    }
    return await r.fn(q, body || {}, p.match(r.re).slice(1).map(decodeURIComponent), form);
  } catch (e) { throw translate(e); }
}
