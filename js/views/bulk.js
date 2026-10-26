// Bulk evidence upload: a ZIP (one folder per request) or several photos at once.
// Each photo is matched to its request and evidence type from the folder / file name,
// and shipping labels are read on the device (OCR) to confirm the request and tracking.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, toast, errToast } from '../ui.js';
import { normalizeFile, uploadFile, ocrTracking } from '../media.js';
import { readZip } from '../zip.js';

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-.]+/g, ' ');
// Most specific first. Matches the English type names and common Spanish words.
const TYPE_WORDS = [
  ['SHIPPING_LABEL_PHOTO', ['shipping label', 'guia', 'etiqueta', 'label', 'tracking']],
  ['CARRIER_DROPOFF_PROOF', ['drop off', 'dropoff', 'entrega a paqueteria', 'comprobante paqueteria']],
  ['FINAL_PACKAGING_PHOTO', ['final packaging', 'embalaje final', 'empaque final', 'caja cerrada']],
  ['PROTECTED_MATERIAL_PHOTO', ['protected material', 'protegid', 'emplay', 'burbuja']],
  ['BOX_PHOTO', ['box photo', 'caja']],
  ['SEPARATED_PRODUCTS_PHOTO', ['separated', 'separad']],
  ['PREPARATION_PHOTO', ['preparation photo', 'preparacion']],
  ['MATERIAL_PHOTO', ['material photo', 'material', 'muestras']],
  ['DELIVERY_PROOF', ['delivery proof', 'prueba de entrega', 'acuse']],
  ['HANDOVER_PROOF', ['handover', 'entrega en bodega']],
  ['PICKUP_CONFIRMATION', ['pickup confirmation', 'recoleccion cliente']],
];
const guessType = (path) => {
  const parts = path.split('/').reverse().map(plain); // file name first, then its folders
  for (const p of parts) for (const [type, words] of TYPE_WORDS) if (words.some((w) => p.includes(w))) return type;
  return '';
};
const folioKey = (s) => { const m = String(s || '').toUpperCase().match(/SMCES[\s_-]*0*(\d{1,6})/); return m ? Number(m[1]) : null; };
const isImage = (name) => /\.(jpe?g|png|webp|heic|heif)$/i.test(name);
const isPdf = (name) => /\.pdf$/i.test(name);
const mimeOf = (name) => (isPdf(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg');
// Phone photos of labels read better in grayscale, enlarged and with more contrast.
async function forOcr(blob) {
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const s = Math.min(2.2, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d'); g.filter = 'grayscale(1) contrast(1.6)'; g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
async function sha(blob) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), (x) => x.toString(16).padStart(2, '0')).join(''); }

export async function render(el, ctx) {
  const { requests } = await api('/requests');
  const byKey = new Map(requests.map((r) => [folioKey(r.requestNo), r.requestNo]));
  const { stages, evidenceLabel, stageLabel } = ctx.meta;
  const typeOptions = Object.entries(stages).map(([st, types]) => {
    const list = types.filter((x) => x !== 'QUANTITY_CONFIRMATION');
    return list.length ? `<optgroup label="${esc(t('stage.' + st, stageLabel[st]))}">${list.map((x) => `<option value="${x}">${esc(evidenceLabel[x])}</option>`).join('')}</optgroup>` : '';
  }).join('');
  let rows = [];
  let busy = false;

  el.innerHTML = html`<div class="page-head"><div><h1>${t('bk.title')}</h1><p>${t('bk.sub')}</p></div></div>
    <div class="card"><div class="pick">
      <label class="btn btn-dark">${icon('upload')}${t('bk.zip')}<input type="file" accept=".zip,application/zip" hidden data-zip></label>
      <label class="btn btn-ghost">${icon('upload')}${t('bk.photos')}<input type="file" accept="image/*,application/pdf" multiple hidden data-photos></label>
    </div><p class="hint" style="margin-top:12px">${t('bk.hint')}</p></div>
    <div data-list></div>`.s;
  const list = el.querySelector('[data-list]');

  const ready = (r) => r.state === 'PENDING' && r.folio && r.type && !(r.conflict && !r.folioConfirmed);
  function draw() {
    if (!rows.length) { list.innerHTML = ''; return; }
    const n = rows.filter(ready).length;
    const reqOpts = (sel) => `<option value="">—</option>` + requests.map((r) => `<option value="${esc(r.requestNo)}" ${r.requestNo === sel ? 'selected' : ''}>${esc(r.requestNo)} · ${esc(r.company || r.customerName || '')}</option>`).join('');
    list.innerHTML = html`<div class="card" style="margin-top:18px">
      <div class="card-head"><h2>${t('bk.review')} (${rows.length})</h2>
        <button class="btn btn-primary" data-go ${n && !busy ? '' : 'disabled'}>${icon('check')}${t('bk.upload')} (${n})</button></div>
      <p class="hint" style="margin:0 0 12px">${t('bk.reviewHint')}</p>
      <div class="table-wrap"><table class="t cards"><thead><tr><th></th><th>${t('bk.file')}</th><th>${t('req.title')}</th><th>${t('up.type')}</th><th>${t('bk.detected')}</th><th>${t('common.status')}</th></tr></thead><tbody>
      ${raw(rows.map((r, i) => html`<tr>
        <td>${r.preview ? raw(`<img src="${r.preview}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:6px;display:block">`) : icon('file')}</td>
        <td data-l="${t('bk.file')}" class="small" style="max-width:220px;word-break:break-word">${r.path}</td>
        <td data-l="${t('req.title')}"><select class="input" data-folio="${i}" ${r.state !== 'PENDING' || busy ? 'disabled' : ''}>${raw(reqOpts(r.folio))}</select></td>
        <td data-l="${t('up.type')}"><select class="input" data-type="${i}" ${r.state !== 'PENDING' || busy ? 'disabled' : ''}><option value="">—</option>${raw(typeOptions.replace(`value="${r.type}"`, `value="${r.type}" selected`))}</select></td>
        <td data-l="${t('bk.detected')}" class="small">${r.ocrBusy ? t('bk.reading') : ''}${r.tracking ? raw(`<span class="mono">${esc(r.tracking)}</span><br>`) : ''}${r.labelFolio ? `${t('bk.labelSays')} ${r.labelFolio}` : ''}
          ${r.conflict && !r.folioConfirmed ? raw(`<div class="badge red" style="margin-top:4px;white-space:normal">${esc(t('bk.conflict'))}</div><div style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-use="${i}">${esc(t('bk.use'))} ${esc(r.labelFolio)}</button></div>`) : ''}</td>
        <td data-l="${t('common.status')}">${raw(stateBadge(r))}</td></tr>`.s).join(''))}
      </tbody></table></div></div>`.s;
    list.querySelector('[data-go]')?.addEventListener('click', go);
    list.querySelectorAll('[data-folio]').forEach((s) => s.addEventListener('change', () => { const r = rows[s.dataset.folio]; r.folio = s.value; r.folioConfirmed = true; draw(); }));
    list.querySelectorAll('[data-use]').forEach((x) => x.addEventListener('click', () => { const r = rows[x.dataset.use]; r.folio = r.labelFolio; r.folioConfirmed = true; draw(); }));
    list.querySelectorAll('[data-type]').forEach((s) => s.addEventListener('change', () => { rows[s.dataset.type].type = s.value; draw(); }));
  }
  function stateBadge(r) {
    if (r.state === 'DONE') return `<span class="badge green">${esc(t('bk.done'))}</span>`;
    if (r.state === 'DUP') return `<span class="badge">${esc(t('bk.dup'))}</span>`;
    if (r.state === 'ERROR') return `<span class="badge red" title="${esc(r.msg || '')}">${esc(t('common.error'))}</span><div class="small">${esc(r.msg || '')}</div>`;
    if (r.state === 'UPLOADING') return `<span class="badge blue">${esc(t('bk.uploading'))}</span>`;
    if (r.conflict && !r.folioConfirmed) return `<span class="badge red">${esc(t('bk.check'))}</span>`;
    return ready(r) ? `<span class="badge amber">${esc(t('bk.ready'))}</span>` : `<span class="badge">${esc(t('bk.missing'))}</span>`;
  }

  async function load(entries) {
    rows.forEach((r) => r.preview && URL.revokeObjectURL(r.preview));
    rows = [];
    const seen = new Set();
    for (const e of entries) {
      if (!isImage(e.name) && !isPdf(e.name)) continue;
      const hash = await sha(e.blob);
      if (seen.has(hash)) continue; // the same photo twice in the bundle
      seen.add(hash);
      const folio = byKey.get(folioKey(e.path)) || '';
      const named = (e.name.toUpperCase().match(/1Z[0-9A-Z]{16}/) || [''])[0];
      rows.push({ path: e.path, name: e.name, blob: e.blob, hash, folio, type: guessType(e.path), tracking: named, state: 'PENDING', preview: isImage(e.name) && !/\.hei[cf]$/i.test(e.name) ? URL.createObjectURL(e.blob) : null });
    }
    if (!rows.length) { toast(t('bk.none'), 'err'); draw(); return; }
    draw();
    // Shipping labels: read the request reference and tracking number printed on the label.
    for (const r of rows.filter((x) => x.preview && (!x.type || x.type === 'SHIPPING_LABEL_PHOTO'))) {
      r.ocrBusy = true; draw();
      try {
        const { candidates, text } = await ocrTracking(await forOcr(r.blob));
        const spaced = (text.toUpperCase().match(/1Z(?:\s*[0-9A-Z]){16}/) || [''])[0].replace(/\s+/g, ''); // labels print "1Z 5Y7 TE9 03 ..."
        const ups = candidates.find((c) => /^1Z/.test(c)) || spaced;
        const k = folioKey(text);
        if (ups || /TRACKING|UPS|FEDEX|DHL/i.test(text)) { r.type = r.type || 'SHIPPING_LABEL_PHOTO'; r.tracking = r.tracking || ups || (/UPS/i.test(text) ? '' : candidates[0] || ''); } // never a phone number as a UPS tracking
        if (k !== null && byKey.has(k)) {
          r.labelFolio = byKey.get(k);
          if (!r.folio) r.folio = r.labelFolio;
          else if (r.folio !== r.labelFolio) r.conflict = true;
        }
      } catch { /* OCR is only a help; the user still chooses */ }
      r.ocrBusy = false; draw();
    }
  }

  async function go() {
    const todo = rows.filter(ready);
    if (!todo.length) return;
    busy = true; draw();
    let ok = 0, dup = 0, bad = 0;
    try {
      todo.forEach((r) => { r.opKey = `BULK-${r.hash.slice(0, 32)}-${r.folio}-${r.type}`; });
      const { known } = await api('/evidence/known', { method: 'POST', body: { keys: todo.map((r) => r.opKey) } });
      for (const r of todo) {
        if (known.includes(r.opKey)) { r.state = 'DUP'; dup++; draw(); continue; }
        r.state = 'UPLOADING'; draw();
        try {
          const item = await normalizeFile(new File([r.blob], r.name, { type: mimeOf(r.name) }));
          const file = await uploadFile(r.folio, item);
          await api('/evidence', { method: 'POST', body: { requestNo: r.folio, type: r.type, fileId: file.id, notes: r.tracking ? `Tracking on label: ${r.tracking}` : '', opKey: r.opKey } });
          r.state = 'DONE'; ok++;
        } catch (e) { r.state = 'ERROR'; r.msg = e.message; bad++; }
        draw();
      }
    } catch (e) { errToast(e); } finally { busy = false; draw(); }
    toast(`${t('bk.summary')}: ${ok} ${t('bk.done').toLowerCase()} · ${dup} ${t('bk.dup').toLowerCase()} · ${bad} ${t('bk.failed')}`, bad ? 'err' : 'ok', 7000);
    ctx.refreshBadges?.();
  }

  el.querySelector('[data-zip]').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f || busy) return;
    try { await load(await readZip(f)); } catch { toast(t('bk.badZip'), 'err'); }
  });
  el.querySelector('[data-photos]').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length || busy) return;
    await load(files.map((f) => ({ path: f.webkitRelativePath || f.name, name: f.name, blob: f })));
  });
}
