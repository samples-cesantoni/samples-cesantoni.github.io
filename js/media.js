// Photo handling for evidence: phone camera or file picker -> resized JPEG -> private upload.
import { api } from './api.js';
import { t } from './i18n.js';
import { esc, html, icon, toast, errToast, opKey, raw } from './ui.js';

const MAX_SIDE = 1600; // photos live in the shared Firebase quota: keep them light but legible
const MAX_BYTES = 5 * 1024 * 1024;

export async function normalizeFile(file) {
  if (file.size > MAX_BYTES * 2) throw new Error(t('up.tooBig'));
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    if (file.size > MAX_BYTES) throw new Error(t('up.tooBig'));
    return { blob: file, name: file.name, mime: 'application/pdf', preview: null };
  }
  if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error(t('up.unsupported'));
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { throw new Error(t('up.unsupported')); }
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.78));
  return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', preview: URL.createObjectURL(blob), canvas: c };
}

export async function uploadFile(requestNo, item, category = 'EVIDENCE') {
  const fd = new FormData();
  fd.append('category', category);
  if (requestNo) fd.append('requestNo', requestNo);
  fd.append('file', item.blob, item.name);
  return (await api('/files', { method: 'POST', form: fd })).file;
}

// Reusable evidence uploader. `types`: list of evidence type codes allowed here.
export function mountUploader(el, { requestNo, types, meta, replaces = null, compact = false, onSaved, autoCamera = false, extra }) {
  const items = [];
  el.innerHTML = html`<form class="uploader">
    <div class="form-grid">
      <label class="field"><span>${t('up.type')}</span><select class="input" name="type" ${types.length === 1 ? 'disabled' : ''}>${raw(types.map((x) => `<option value="${x}">${esc(meta.evidenceLabel[x])}</option>`).join(''))}</select></label>
      ${extra ? raw(extra) : ''}
      ${compact ? '' : html`<label class="field"><span>${t('up.notes')}</span><input class="input" name="notes" maxlength="500"></label>`}
    </div>
    <div class="pick" style="margin-top:12px">
      <label class="btn btn-dark">${icon('capture')}${t('up.camera')}<input type="file" accept="image/*" capture="environment" hidden data-cam></label>
      <label class="btn btn-ghost">${icon('upload')}${t('up.file')}<input type="file" accept="image/*,application/pdf" multiple hidden data-file></label>
    </div>
    <div class="previews"></div>
    <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('check')}${t('up.save')}</button></div>
  </form>`.s;
  const form = el.querySelector('form');
  const pv = el.querySelector('.previews');
  const draw = () => {
    pv.innerHTML = items.map((it, i) => `<div class="pv">${it.preview ? `<img src="${it.preview}" alt="">` : `<span>${icon('file').s}<br>${esc(it.name)}</span>`}<button type="button" data-rm="${i}" aria-label="remove">×</button></div>`).join('');
  };
  pv.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { items.splice(Number(b.dataset.rm), 1); draw(); } });
  const add = async (files) => {
    for (const f of files) {
      try { pv.insertAdjacentHTML('beforeend', `<div class="pv tmp">${esc(t('up.processing'))}</div>`); items.push(await normalizeFile(f)); } catch (e) { toast(e.message, 'err'); }
    }
    draw();
  };
  el.querySelector('[data-cam]').addEventListener('change', (e) => { add([...e.target.files]); e.target.value = ''; });
  el.querySelector('[data-file]').addEventListener('change', (e) => { add([...e.target.files]); e.target.value = ''; });
  if (autoCamera) setTimeout(() => el.querySelector('[data-cam]').click(), 50);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!items.length) { toast(t('up.need'), 'err'); return; }
    const btn = form.querySelector('[type=submit]');
    btn.classList.add('loading');
    try {
      const type = form.type.value;
      const extraVals = Object.fromEntries([...form.querySelectorAll('[data-extra]')].map((x) => [x.name, x.value]));
      let first = true;
      for (const it of items.slice()) {
        const file = await uploadFile(requestNo, it);
        await api('/evidence', { method: 'POST', body: { requestNo, type, fileId: file.id, notes: form.notes?.value || '', replacesId: first ? replaces : null, opKey: opKey(), ...extraVals } });
        first = false;
        items.shift(); draw();
      }
      toast(t('up.saved'), 'ok');
      onSaved?.();
    } catch (err) { errToast(err); } finally { btn.classList.remove('loading'); }
  });
  return { addFiles: add, items };
}

// ---------- OCR (self-hosted tesseract.js; nothing leaves the browser) ----------
let workerP = null;
function loadScript(src) { return new Promise((res, rej) => { if (window.Tesseract) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function worker() {
  if (!workerP) {
    workerP = (async () => {
      await loadScript('vendor/tesseract/tesseract.min.js');
      return window.Tesseract.createWorker('eng', 1, { workerPath: 'vendor/tesseract/worker.min.js', corePath: 'vendor/tesseract/', langPath: 'vendor/tesseract/', gzip: true, workerBlobURL: false });
    })();
  }
  return workerP;
}
// Known tracking-number shapes. Candidates are suggestions only; the user must verify.
const PATTERNS = [/\b1Z[0-9A-Z]{16}\b/g, /\b\d{20,22}\b/g, /\b\d{15}\b/g, /\b\d{12}\b/g, /\b\d{10}\b/g, /\b[A-Z]{2}\d{9}[A-Z]{2}\b/g, /\b\d{22}\b/g];
export async function ocrTracking(fileOrCanvas) {
  const w = await worker();
  const { data } = await w.recognize(fileOrCanvas);
  const text = String(data.text || '').toUpperCase();
  const joined = text.replace(/(\d)[ \t](?=\d)/g, '$1'); // labels often print digits in groups
  const found = new Set();
  for (const src of [text, joined]) for (const re of PATTERNS) for (const m of src.matchAll(re)) found.add(m[0]);
  return { candidates: [...found].slice(0, 6), text };
}
