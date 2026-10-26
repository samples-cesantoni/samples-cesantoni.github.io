import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, busy, toast } from '../ui.js';
import { requestPicker } from './shared.js';
import { drawQr, drawLabel, qrText, canvasToPng, printLabels } from '../labels.js';

const SIZES = {
  master: [['4x6', '4 × 6 in'], ['100x150', '100 × 150 mm'], ['letter', 'Letter'], ['a4', 'A4']],
  jr: [['4x2', '4 × 2 in'], ['100x50', '100 × 50 mm']],
};

export async function render(el, ctx) {
  let det = null;
  el.innerHTML = html`<div class="page-head"><div><h1>${t('lb.title')}</h1><p>${t('lb.sub')}</p></div></div>
    <div class="card"><div class="form-grid">
      <div data-picker id="lbpick"></div>
      <label class="field"><span>${t('lb.type')}</span><select class="input" data-type><option value="master">${t('lb.master')}</option><option value="jr">${t('lb.jr')}</option></select></label>
      <label class="field" data-linef><span>${t('lb.product')}</span><select class="input" data-line disabled></select></label>
      <label class="field" data-boxesf><span>${t('lb.boxes')}</span><input class="input" type="number" min="1" max="20" value="1" data-boxes></label>
      <label class="field"><span>${t('lb.printSize')}</span><select class="input" data-size></select></label>
    </div></div>
    <div data-stage></div>`.s;
  const stage = el.querySelector('[data-stage]');
  const lineSel = el.querySelector('[data-line]');
  const typeSel = el.querySelector('[data-type]');
  const sizeSel = el.querySelector('[data-size]');
  const boxesIn = el.querySelector('[data-boxes]');
  if (ctx.query.type === 'jr') typeSel.value = 'jr';

  const boxes = () => Math.max(1, Math.min(20, Number(boxesIn.value) || 1));
  const master = (box = 1) => ({ kind: 'master', requestNo: det.requestNo, company: det.company, city: det.city, state: det.state, country: det.country,
    lines: det.lines, pieces: det.pieces, carrier: det.shipment?.carrier || '', trackingNo: det.shipment?.trackingNo || '', box, boxes: boxes() });
  const jr = (l) => ({ kind: 'jr', requestNo: det.requestNo, line: l.line, sku: l.sku, model: l.model, color: l.color, pieceSize: l.pieceSize, pieces: l.pieces,
    location: l.deductions?.[0]?.location || l.location || '', deducted: (l.deductedQty || 0) >= l.pieces });
  const current = () => {
    if (!det) return null;
    if (typeSel.value === 'master') return master(1);
    return jr(det.lines.find((x) => String(x.line) === lineSel.value) || det.lines[0]);
  };
  const setSizes = () => {
    sizeSel.innerHTML = SIZES[typeSel.value].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    el.querySelector('[data-linef]').hidden = typeSel.value !== 'jr';
    el.querySelector('[data-boxesf]').hidden = typeSel.value !== 'master';
  };
  const draw = async () => {
    const d = current();
    if (!d) { stage.innerHTML = html`<div class="empty">${icon('qr')}${t('cap.pick')}</div>`.s; return; }
    const isJr = d.kind === 'jr';
    stage.innerHTML = html`<div class="label-stage" style="margin-top:18px">
      <div class="card"><div class="qr-box"><canvas data-qr aria-label="QR"></canvas>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-dark" data-dlqr>${icon('download')}${t('lb.qrPng')}</button><button class="btn btn-primary" data-dllabel>${icon('download')}${t('lb.labelPng')}</button><button class="btn btn-ghost" data-print>${icon('printer')}${t('lb.print')}</button></div>
        ${isJr ? html`<label class="check small"><input type="checkbox" data-all checked><span>${t('lb.printAll')}</span></label>` : html`<p class="small muted" style="margin:0">${t('lb.boxesNote')} ${boxes()}</p>`}
        <div style="width:100%"><div class="label" style="margin-bottom:6px">${t('lb.content')}</div><pre class="qr-text" data-text></pre><p class="hint" style="margin-top:8px">${t('lb.readerNote')}</p></div></div></div>
      <div class="card label-preview"><canvas data-label aria-label="Label preview"></canvas></div></div>`.s;
    const text = qrText(d);
    stage.querySelector('[data-text]').textContent = text;
    drawQr(stage.querySelector('[data-qr]'), text, 660);
    await drawLabel(stage.querySelector('[data-label]'), d);
    const base = isJr ? `${d.requestNo}_JR_L${d.line}` : `${d.requestNo}_MASTER`;
    stage.querySelector('[data-dlqr]').addEventListener('click', (e) => busy(e.currentTarget, async () => { const c = document.createElement('canvas'); drawQr(c, text, 1000); await canvasToPng(c, `${base}_QR.png`); }));
    stage.querySelector('[data-dllabel]').addEventListener('click', (e) => busy(e.currentTarget, () => canvasToPng(stage.querySelector('[data-label]'), `${base}.png`)));
    stage.querySelector('[data-print]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const list = isJr
        ? (stage.querySelector('[data-all]').checked ? det.lines.map(jr) : [d])
        : Array.from({ length: boxes() }, (_, i) => master(i + 1));
      await printLabels(list, sizeSel.value);
    }));
  };
  const choose = async (no) => {
    det = await api(`/requests/${encodeURIComponent(no)}`);
    history.replaceState(null, '', `#/labels?request=${encodeURIComponent(no)}`);
    lineSel.disabled = false;
    lineSel.innerHTML = det.lines.map((l) => `<option value="${l.line}">${l.line}. ${esc(l.model)} · ${esc(l.color)} · ${esc(l.pieceSize || '')}</option>`).join('');
    if (ctx.query.line) lineSel.value = ctx.query.line;
    draw().catch((e) => toast(e.message, 'err'));
  };
  setSizes();
  lineSel.addEventListener('change', draw);
  boxesIn.addEventListener('change', draw);
  typeSel.addEventListener('change', () => { setSizes(); draw(); });
  await requestPicker(el.querySelector('[data-picker]'), { value: ctx.query.request, onPick: choose });
  if (ctx.query.request) await choose(ctx.query.request); else draw();
}
