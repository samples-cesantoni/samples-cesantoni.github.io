// Public sample request form (no sign-in). Reads the catalog the platform publishes (sc_config/catalogo: only
// products with stock are offered) and creates the request under the next folio in one transaction
// (sc_config/folio + sc_pedidos/SMCES-00nn). The platform turns it into a request and deducts the inventory.
import * as fb from './firebase-sdk.js';

const CFG = window.SC_CONFIG || {};
const app = fb.initializeApp(CFG.firebase, 'public-form');
const db = fb.getFirestore(app);
if (CFG.emulator) { const [h, p] = CFG.emulator.firestore.split(':'); fb.connectFirestoreEmulator(db, h, Number(p)); }

const root = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KIND = { CUT: '8×8 in cut sample', FULL: 'Full piece', MESH: 'Mesh' };
const folioId = (n) => `SMCES-${String(n).padStart(4, '0')}`;
const cart = new Map(); // ref -> { item, pieces }
let catalog = [];

function productCard(it) {
  const inCart = cart.has(it.ref);
  return `<div class="pf-item ${inCart ? 'on' : ''}">
    <div class="pf-item-t"><strong>${esc(it.model)}</strong>${it.color ? ` · ${esc(it.color)}` : ''}</div>
    <div class="pf-item-m">${esc([it.finish, it.size].filter(Boolean).join(' · '))}</div>
    <div class="pf-item-f"><span class="badge ${it.kind === 'FULL' ? 'dark' : 'orange'}">${esc(KIND[it.kind] || 'Sample')}</span>
      <button type="button" class="btn ${inCart ? 'btn-ghost' : 'btn-primary'} btn-sm" data-add="${esc(it.ref)}">${inCart ? 'Added' : 'Add'}</button></div></div>`;
}
function drawList() {
  const f = root.querySelector('[data-filter]');
  const term = f.q.value.trim().toUpperCase(); const kind = f.kind.value;
  const list = catalog.filter((i) => (!kind || i.kind === kind) && (!term || `${i.model} ${i.color} ${i.finish} ${i.size}`.toUpperCase().includes(term)));
  root.querySelector('[data-list]').innerHTML = list.length ? list.map(productCard).join('') : '<div class="empty">No products match your search.</div>';
  root.querySelector('[data-count]').textContent = `${list.length} of ${catalog.length} products`;
}
function drawCart() {
  const box = root.querySelector('[data-cart]');
  const items = [...cart.values()];
  root.querySelector('[data-cartn]').textContent = items.length;
  box.innerHTML = items.length ? items.map(({ item, pieces }) => `<div class="pf-cart-row">
      <div><strong>${esc(item.model)}</strong>${item.color ? ` · ${esc(item.color)}` : ''}<div class="small muted">${esc([KIND[item.kind], item.finish, item.size].filter(Boolean).join(' · '))}</div></div>
      <input class="input pf-qty" type="number" min="1" max="${item.kind === 'FULL' ? 2 : 10}" value="${pieces}" data-qty="${esc(item.ref)}" aria-label="Pieces">
      <button type="button" class="icon-btn" data-rm="${esc(item.ref)}" aria-label="Remove">×</button></div>`).join('') : '<p class="muted small" style="margin:0">Add products from the catalog.</p>';
  root.querySelector('[data-send]').disabled = !items.length;
}

function form() {
  root.innerHTML = `
  <section class="pf-hero"><h1>Request samples</h1><p>Choose the products you would like to see, tell us where to send them and submit. You will receive your request number immediately.</p></section>
  <div class="pf-grid">
    <section class="card">
      <div class="card-head"><div><h2>1. Choose products</h2><p data-count></p></div></div>
      <form class="pf-filter" data-filter><input class="input" name="q" placeholder="Search model, color, finish…" autocomplete="off">
        <select class="input" name="kind"><option value="">All types</option><option value="CUT">8×8 in cut samples</option><option value="FULL">Full pieces</option><option value="MESH">Mesh</option></select></form>
      <div class="pf-list" data-list></div>
    </section>
    <aside class="pf-side">
      <section class="card"><div class="card-head"><h2>Your selection (<span data-cartn>0</span>)</h2></div><div data-cart></div></section>
      <form class="card" data-send-form novalidate>
        <div class="card-head"><h2>2. Shipping details</h2></div>
        <div class="form-grid pf-fields">
          <label class="field"><span>Full name *</span><input class="input" name="fullName" required maxlength="120" autocomplete="name"></label>
          <label class="field"><span>Company</span><input class="input" name="company" maxlength="160" autocomplete="organization"></label>
          <label class="field"><span>Email *</span><input class="input" name="email" type="email" required maxlength="200" autocomplete="email"></label>
          <label class="field"><span>Phone</span><input class="input" name="phone" maxlength="60" autocomplete="tel"></label>
          <label class="field pf-wide"><span>Street address *</span><input class="input" name="address" required maxlength="400" autocomplete="street-address"></label>
          <label class="field"><span>City</span><input class="input" name="city" maxlength="80" autocomplete="address-level2"></label>
          <label class="field"><span>State / Province</span><input class="input" name="state" maxlength="80" autocomplete="address-level1"></label>
          <label class="field"><span>ZIP code</span><input class="input" name="zip" maxlength="20" autocomplete="postal-code"></label>
          <label class="field"><span>Country</span><input class="input" name="country" maxlength="80" value="United States" autocomplete="country-name"></label>
          <label class="field pf-wide"><span>Delivery references</span><input class="input" name="deliveryRefs" maxlength="400"></label>
          <label class="field pf-wide"><span>Notes</span><textarea class="input" name="notes" maxlength="1000"></textarea></label>
        </div>
        <p class="callout danger" data-err hidden style="margin-top:14px"></p>
        <div class="form-actions"><button class="btn btn-primary" type="submit" data-send disabled>Submit request</button></div>
      </form>
    </aside>
  </div>`;
  const f = root.querySelector('[data-filter]');
  f.addEventListener('input', drawList); f.addEventListener('submit', (e) => e.preventDefault());
  root.querySelector('[data-list]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const it = catalog.find((x) => x.ref === b.dataset.add);
    if (cart.has(it.ref)) cart.delete(it.ref); else cart.set(it.ref, { item: it, pieces: 1 });
    drawList(); drawCart();
  });
  root.querySelector('[data-cart]').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { cart.delete(b.dataset.rm); drawList(); drawCart(); } });
  root.querySelector('[data-cart]').addEventListener('change', (e) => {
    const i = e.target.closest('[data-qty]'); if (!i) return;
    const c = cart.get(i.dataset.qty); c.pieces = Math.max(1, Math.min(Number(i.max), Math.round(Number(i.value) || 1))); i.value = c.pieces;
  });
  root.querySelector('[data-send-form]').addEventListener('submit', submit);
  drawList(); drawCart();
}

async function submit(e) {
  e.preventDefault();
  const f = e.target; const err = f.querySelector('[data-err]'); const btn = f.querySelector('[data-send]');
  const v = (k) => String(f[k].value || '').trim();
  err.hidden = true;
  const problems = [];
  if (v('fullName').length < 2) problems.push('full name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v('email'))) problems.push('a valid email');
  if (v('address').length < 5) problems.push('street address');
  if (!cart.size) problems.push('at least one product');
  if (problems.length) { err.textContent = `Please add ${problems.join(', ')}.`; err.hidden = false; return; }
  btn.disabled = true; btn.classList.add('loading');
  const data = {
    createdAt: new Date().toISOString(), lang: 'en', nuevo: true,
    customer: { fullName: v('fullName'), company: v('company'), phone: v('phone'), email: v('email').toLowerCase() },
    country: v('country'), state: v('state'), city: v('city'), zip: v('zip'), address: v('address'), deliveryRefs: v('deliveryRefs'), notes: v('notes'),
    lines: [...cart.values()].map(({ item, pieces }) => ({ ref: item.ref, model: item.model, color: item.color, finish: item.finish, size: item.size, kind: item.kind, pieces })),
  };
  try {
    const folioRef = fb.doc(db, 'sc_config', 'folio');
    const no = await fb.runTransaction(db, async (tx) => {
      const snap = await tx.get(folioRef);
      if (!snap.exists()) throw new Error('The request form is not available right now. Please try again later.');
      const n = snap.data().next; const id = folioId(n);
      tx.set(fb.doc(db, 'sc_pedidos', id), { ...data, requestNo: id });
      tx.update(folioRef, { next: n + 1 });
      return id;
    });
    root.innerHTML = `<section class="card pf-done"><div class="pf-ok">✓</div><h1>Request received</h1>
      <p>Your request number is</p><div class="pf-folio">${esc(no)}</div>
      <p class="muted">Our logistics team will prepare your samples. You will receive updates by email at <strong>${esc(data.customer.email)}</strong>.</p>
      <a class="btn btn-ghost" href="./">Make another request</a></section>`;
  } catch (ex) {
    err.textContent = /permission|PERMISSION/.test(String(ex.code || ex.message)) ? 'The request could not be saved. Please check the information and try again.' : (ex.message || 'The request could not be saved.');
    err.hidden = false; btn.disabled = false; btn.classList.remove('loading');
  }
}

(async () => {
  try {
    const snap = await fb.getDoc(fb.doc(db, 'sc_config', 'catalogo'));
    catalog = ((snap.exists() && snap.data().items) || []).filter((i) => i.available);
    if (!catalog.length) { root.innerHTML = '<div class="card empty">The sample catalog is not available right now. Please try again later.</div>'; return; }
    form();
  } catch { root.innerHTML = '<div class="card empty">The sample catalog could not be loaded. Please try again later.</div>'; }
})();
