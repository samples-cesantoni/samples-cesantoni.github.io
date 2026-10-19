import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, busy, toast } from '../ui.js';
import { requestPicker } from './shared.js';
import { drawQr, drawLabel, qrText, canvasToPng, printLabels } from '../labels.js';

export async function render(el, ctx) {
  let det = null;
  el.innerHTML = html`<div class="page-head"><div><h1>${t('lb.title')}</h1><p>${t('lb.sub')}</p></div></div>
    <div class="card"><div class="form-grid">
      <div data-picker id="lbpick"></div>
      <label class="field"><span>${t('lb.product')}</span><select class="input" data-line disabled></select></label>
      <label class="field"><span>${t('lb.type')}</span><select class="input" data-type><option value="sku">${t('lb.perSku')}</option><option value="general">${t('lb.general')}</option></select></label>
      <label class="field"><span>${t('lb.printSize')}</span><select class="input" data-size><option value="4x6">4 × 6 in</option><option value="100x150">100 × 150 mm</option><option value="letter">Letter</option><option value="a4">A4</option></select></label>
    </div></div>
    <div data-stage></div>`.s;
  const stage = el.querySelector('[data-stage]');
  const lineSel = el.querySelector('[data-line]');
  const typeSel = el.querySelector('[data-type]');

  const current = () => {
    if (!det) return null;
    if (typeSel.value === 'general') return { general: true, requestNo: det.requestNo, company: det.company, lines: det.lines };
    const l = det.lines.find((x) => String(x.line) === lineSel.value) || det.lines[0];
    return { requestNo: det.requestNo, ...l };
  };
  const draw = async () => {
    const d = current();
    if (!d) { stage.innerHTML = html`<div class="empty">${icon('qr')}${t('cap.pick')}</div>`.s; return; }
    lineSel.disabled = typeSel.value === 'general';
    stage.innerHTML = html`<div class="label-stage" style="margin-top:18px">
      <div class="card"><div class="qr-box"><canvas data-qr aria-label="QR"></canvas>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-dark" data-dlqr>${icon('download')}${t('lb.qrPng')}</button><button class="btn btn-primary" data-dllabel>${icon('download')}${t('lb.labelPng')}</button><button class="btn btn-ghost" data-print>${icon('printer')}${t('lb.print')}</button></div>
        <label class="check small"><input type="checkbox" data-all checked><span>${t('lb.printAll')}</span></label>
        <div style="width:100%"><div class="label" style="margin-bottom:6px">${t('lb.content')}</div><pre class="qr-text" data-text></pre><p class="hint" style="margin-top:8px">${t('lb.readerNote')}</p></div></div></div>
      <div class="card label-preview"><canvas data-label aria-label="Label preview"></canvas></div></div>`.s;
    const text = qrText(d);
    stage.querySelector('[data-text]').textContent = text;
    drawQr(stage.querySelector('[data-qr]'), text, 660);
    await drawLabel(stage.querySelector('[data-label]'), d);
    const base = d.general ? `${d.requestNo}_GENERAL` : `${d.requestNo}_L${d.line}`;
    stage.querySelector('[data-dlqr]').addEventListener('click', (e) => busy(e.currentTarget, async () => { const c = document.createElement('canvas'); drawQr(c, text, 1000); await canvasToPng(c, `${base}_QR.png`); }));
    stage.querySelector('[data-dllabel]').addEventListener('click', (e) => busy(e.currentTarget, () => canvasToPng(stage.querySelector('[data-label]'), `${base}_LABEL.png`)));
    stage.querySelector('[data-print]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      const all = stage.querySelector('[data-all]').checked && !d.general;
      const list = all ? det.lines.map((l) => ({ requestNo: det.requestNo, ...l })) : [d];
      await printLabels(list, el.querySelector('[data-size]').value);
    }));
  };
  const choose = async (no) => {
    det = await api(`/requests/${encodeURIComponent(no)}`);
    history.replaceState(null, '', `#/labels?request=${encodeURIComponent(no)}`);
    lineSel.disabled = false;
    lineSel.innerHTML = det.lines.map((l) => `<option value="${l.line}">${l.line}. ${esc(l.sku || t('common.notRegistered'))} · ${esc(l.model)} · ${esc(l.color)}</option>`).join('');
    if (ctx.query.line) lineSel.value = ctx.query.line;
    draw().catch((e) => toast(e.message, 'err'));
  };
  lineSel.addEventListener('change', draw);
  typeSel.addEventListener('change', draw);
  await requestPicker(el.querySelector('[data-picker]'), { value: ctx.query.request, onPick: choose });
  if (ctx.query.request) await choose(ctx.query.request); else draw();
}
