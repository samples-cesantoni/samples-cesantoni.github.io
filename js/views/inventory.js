import { api, qs, saveBlob } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, emptyState, modal, toast, errToast, busy, confirmDialog } from '../ui.js';

const KIND = { CUT: '20×20 CUT', FULL: 'STANDARD', MESH: 'MESH' };
const tone = (r) => (r.active === false ? '' : !(r.quantity > 0) ? 'red' : r.quantity < 5 ? 'amber' : 'green');
const stateKey = (r) => (r.active === false ? 'is.INACTIVE' : !(r.quantity > 0) ? 'is.OUT_OF_STOCK' : r.quantity < 5 ? 'is.LOW' : 'is.AVAILABLE');

export async function render(el, ctx) {
  const ces = ctx.session.area === 'CESANTONI';
  let tab = ctx.query.tab === 'movements' ? 'movements' : 'stock';
  let data;
  const f = { q: ctx.query.q || '', kind: '', state: '' };

  el.innerHTML = html`<div class="page-head"><div><h1>${t('inv.title')}</h1><p data-sub></p></div>
      ${ces ? html`<div class="actions"><button class="btn btn-ghost" data-export>${icon('download')}${t('stk.export')}</button>
        <button class="btn btn-ghost" data-import>${icon('upload')}${t('stk.import')}</button>
        <button class="btn btn-primary" data-add>${icon('plus')}${t('stk.add')}</button></div>` : ''}</div>
    <div data-mode></div>
    <div class="kpis" data-kpis style="margin-bottom:18px"></div>
    <div class="card"><div class="tabs" data-tabs></div><div data-body></div></div>`.s;

  const load = async () => { data = await api('/stock'); draw(); };
  function draw() {
    const platform = data.mode === 'PLATFORM';
    el.querySelector('[data-sub]').textContent = t(platform ? 'stk.subPlatform' : 'stk.subBase');
    el.querySelector('[data-mode]').innerHTML = !platform && ces ? html`<div class="callout warn" style="margin-bottom:18px;align-items:center">${icon('info')}<span style="flex:1">${t('stk.baseNote')}</span><button class="btn btn-dark btn-sm" data-switch>${t('stk.switch')}</button></div>`.s : '';
    el.querySelectorAll('[data-import],[data-add]').forEach((b) => { b.hidden = !platform && b.hasAttribute('data-add'); });
    const k = data.kpis;
    el.querySelector('[data-kpis]').innerHTML = [['stk.kProducts', k.products, ''], ['stk.kUnits', k.units.toLocaleString(), 'accent'], ['stk.kLow', k.low, 'amber'], ['stk.kOut', k.out, 'red']]
      .map(([l, v, c]) => `<div class="kpi ${c}"><div class="k">${esc(t(l))}</div><div class="v">${esc(v)}</div></div>`).join('');
    el.querySelector('[data-tabs]').innerHTML = [['stock', 'stk.tabStock', data.rows.length], ['movements', 'inv.movements']].map(([key, l, n]) => `<button class="${key === tab ? 'on' : ''}" data-t="${key}">${esc(t(l))}${n !== undefined ? `<span class="count">${n}</span>` : ''}</button>`).join('');
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; draw(); }));
    el.querySelector('[data-switch]')?.addEventListener('click', async (e) => {
      if (!(await confirmDialog(t('stk.switchConfirm')))) return;
      busy(e.target, async () => { await api('/stock/platform', { method: 'POST', body: {} }); toast(t('stk.switched'), 'ok'); load(); }).catch(() => {});
    });
    if (tab === 'stock') drawStock(platform); else drawMoves();
  }

  function drawStock(platform) {
    const body = el.querySelector('[data-body]');
    body.innerHTML = html`<form class="filters" data-f style="margin-bottom:14px">
        <label class="field search"><span>${t('common.search')}</span><input class="input" name="q" value="${f.q}" placeholder="${t('inv.searchPh')}"></label>
        <label class="field"><span>${t('inv.type')}</span><select class="input" name="kind"><option value="">${t('common.all')}</option>${raw(Object.entries(KIND).map(([v, l]) => `<option value="${v}" ${f.kind === v ? 'selected' : ''}>${l}</option>`).join(''))}</select></label>
        <label class="field"><span>${t('inv.state')}</span><select class="input" name="state"><option value="">${t('common.all')}</option>${raw(['is.AVAILABLE', 'is.LOW', 'is.OUT_OF_STOCK', 'is.INACTIVE'].map((v) => `<option value="${v}" ${f.state === v ? 'selected' : ''}>${esc(t(v))}</option>`).join(''))}</select></label>
      </form><div data-table></div>`.s;
    const form = body.querySelector('[data-f]');
    const table = () => {
      const term = f.q.trim().toUpperCase();
      const rows = data.rows.filter((r) => (!f.kind || r.kind === f.kind) && (!f.state || stateKey(r) === f.state)
        && (!term || [r.model, r.color, r.finish, r.sampleSize, r.label, r.ref].some((v) => String(v || '').toUpperCase().includes(term))));
      body.querySelector('[data-table]').innerHTML = rows.length ? html`<div class="table-wrap sticky"><table class="t cards dense"><thead><tr>
          <th>${t('stk.location')}</th><th>${t('common.model')}</th><th>${t('common.color')}</th><th>${t('inv.finish')}</th><th>${t('inv.sampleSize')}</th><th>${t('inv.type')}</th><th class="num">${t('inv.onHand')}</th><th>${t('inv.state')}</th>${ces && platform ? html`<th></th>` : ''}</tr></thead><tbody>
        ${raw(rows.map((r) => html`<tr class="${r.active === false ? 'inactive' : ''} ${ces && platform ? 'click' : ''}" data-row="${r.ref}">
          <td data-l="${t('stk.location')}" class="small nowrap">${r.label || '—'}</td><td data-l="${t('common.model')}" class="strong">${r.model}</td><td data-l="${t('common.color')}">${r.color || '—'}</td>
          <td data-l="${t('inv.finish')}">${r.finish || '—'}</td><td data-l="${t('inv.sampleSize')}" class="small">${r.sampleSize || '—'}</td><td data-l="${t('inv.type')}" class="small">${KIND[r.kind] || '—'}</td>
          <td data-l="${t('inv.onHand')}" class="num strong">${r.quantity ?? 0}</td><td data-l="${t('inv.state')}"><span class="badge ${tone(r)}">${t(stateKey(r))}</span></td>
          ${ces && platform ? html`<td style="text-align:right"><button class="btn btn-ghost btn-sm" data-edit="${r.ref}" tabindex="-1">${t('stk.edit')}</button></td>` : ''}</tr>`.s).join(''))}</tbody></table></div>
        <p class="small muted" style="margin:10px 2px 0">${rows.length} / ${data.rows.length}</p>`.s : emptyState().s;
      if (ces && platform) body.querySelectorAll('[data-row]').forEach((tr) => tr.addEventListener('click', () => editRow(data.rows.find((r) => r.ref === tr.dataset.row))));
    };
    let timer;
    form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { f.q = form.q.value; f.kind = form.kind.value; f.state = form.state.value; table(); }, 150); });
    form.addEventListener('submit', (e) => e.preventDefault());
    table();
  }

  async function drawMoves() {
    const body = el.querySelector('[data-body]');
    const { movements } = await api('/inventory/movements');
    const label = (m) => (m.source === 'BASE' ? t('mv.BASE') : m.source === 'AUTO' && m.type === 'ISSUE' ? t('mv.AUTO') : m.source === 'EXCEL' ? t('mv.EXCEL') : m.source === 'EDIT' ? t('mv.EDIT') : t('mv.' + m.type, m.type));
    body.innerHTML = movements.length ? html`<div class="table-wrap"><table class="t cards dense"><thead><tr><th>${t('common.date')}</th><th>${t('inv.type2')}</th><th>${t('common.model')}</th><th>${t('stk.location')}</th><th class="num">${t('common.qty')}</th><th class="num">${t('det.stockMove')}</th><th>${t('common.request')}</th><th>${t('inv.reason')}</th></tr></thead><tbody>
      ${raw(movements.map((m) => html`<tr><td data-l="${t('common.date')}" class="small nowrap">${fmtDate(m.at)}</td><td data-l="${t('inv.type2')}"><span class="badge ${m.type === 'ISSUE' ? 'dark' : ['RETURN', 'RECEIPT'].includes(m.type) ? 'green' : ''}">${label(m)}</span></td>
        <td data-l="${t('common.model')}">${m.item}</td><td data-l="${t('stk.location')}" class="small">${m.location || '—'}</td><td data-l="${t('common.qty')}" class="num">${m.type === 'ISSUE' || m.type === 'ADJUST' ? '−' : '+'}${m.qty}</td>
        <td data-l="${t('det.stockMove')}" class="num small">${m.before ?? '—'} → ${m.after ?? '—'}</td>
        <td data-l="${t('common.request')}">${m.requestNo ? raw(`<a href="#/requests/${encodeURIComponent(m.requestNo)}">${esc(m.requestNo)}</a>`) : '—'}</td><td data-l="${t('inv.reason')}" class="small muted">${m.note || ''}</td></tr>`.s).join(''))}</tbody></table></div>`.s : emptyState().s;
  }

  // ---- add / edit one product
  function editRow(r) {
    const row = r || { model: '', color: '', finish: '', sampleSize: '', cut20: true, fullPiece: false, cabinet: '', position: '', quantity: 0, active: true };
    const m = modal({ title: r ? `${t('stk.edit')} · ${r.model}` : t('stk.add'), wide: true, body: html`<form class="form-grid" data-rowf>
      <label class="field"><span>${t('common.model')} *</span><input class="input" name="model" value="${row.model}" required></label>
      <label class="field"><span>${t('common.color')}</span><input class="input" name="color" value="${row.color || ''}"></label>
      <label class="field"><span>${t('inv.finish')}</span><input class="input" name="finish" value="${row.finish || ''}"></label>
      <label class="field"><span>${t('inv.sampleSize')}</span><input class="input" name="sampleSize" value="${row.sampleSize || ''}" placeholder="20*20 CM / 8x8 IN"></label>
      <label class="field"><span>${t('inv.cabinet')}</span><input class="input" name="cabinet" value="${row.cabinet || ''}"></label>
      <label class="field"><span>${t('inv.position')}</span><input class="input" name="position" value="${row.position || ''}"></label>
      <label class="field"><span>${t('inv.type')}</span><select class="input" name="kind"><option value="CUT" ${row.cut20 ? 'selected' : ''}>20×20 CUT</option><option value="FULL" ${!row.cut20 && row.fullPiece ? 'selected' : ''}>STANDARD</option></select></label>
      <label class="field"><span>${t('inv.onHand')} *</span><input class="input" type="number" min="0" step="1" name="quantity" value="${row.quantity ?? 0}" required></label>
      <label class="field" style="grid-column:1/-1"><span>${t('inv.reason')}</span><input class="input" name="reason" maxlength="300" placeholder="${t('inv.reasonPh')}"></label>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="active" ${row.active !== false ? 'checked' : ''}><span>${t('stk.activeHelp')}</span></label>
      <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>`.s });
    const fm = m.body.querySelector('[data-rowf]');
    fm.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = { ref: r ? r.ref : undefined, model: fm.model.value, color: fm.color.value, finish: fm.finish.value, sampleSize: fm.sampleSize.value, cabinet: fm.cabinet.value, position: fm.position.value,
        cut20: fm.kind.value === 'CUT', fullPiece: fm.kind.value === 'FULL', quantity: Number(fm.quantity.value), reason: fm.reason.value, active: fm.active.checked };
      busy(fm.querySelector('[type=submit]'), async () => { try { await api('/stock/rows', { method: 'POST', body: b }); toast(t('common.saved'), 'ok'); m.close(); load(); } catch (err) { errToast(err); } });
    });
  }

  // ---- Excel: preview the changes, then apply
  function importExcel() {
    const m = modal({ title: t('stk.import'), wide: true, body: html`<form data-xf><p class="hint" style="margin-top:0">${t('stk.importHelp')}</p>
      <input class="input" type="file" name="file" accept=".xlsx" required>
      <div class="form-actions"><button class="btn btn-dark" type="submit">${t('stk.preview')}</button></div></form><div data-diff></div>`.s });
    const fm = m.body.querySelector('[data-xf]');
    fm.addEventListener('submit', (e) => {
      e.preventDefault();
      const file = fm.file.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      busy(fm.querySelector('[type=submit]'), async () => {
        try {
          const d = await api('/stock/excel/preview', { method: 'POST', form: fd });
          const list = (rows, cols) => rows.length ? `<div class="table-wrap" style="max-height:240px;overflow:auto;margin-top:8px"><table class="t dense"><tbody>${rows.slice(0, 200).map(cols).join('')}</tbody></table></div>` : '';
          m.body.querySelector('[data-diff]').innerHTML = html`<div class="kpis" style="margin-top:18px"><div class="kpi green"><div class="k">${t('stk.dAdded')}</div><div class="v">${d.added.length}</div></div>
            <div class="kpi accent"><div class="k">${t('stk.dChanged')}</div><div class="v">${d.changed.length}</div></div><div class="kpi"><div class="k">${t('stk.dSame')}</div><div class="v">${d.same}</div></div>
            <div class="kpi amber"><div class="k">${t('stk.dMissing')}</div><div class="v">${d.missing.length}</div></div></div>
            ${raw(list(d.changed, (x) => `<tr><td class="strong">${esc(x.model)}</td><td>${esc(x.color || '')}</td><td class="small">${esc(x.size || '')}</td><td class="num">${x.before} → <strong>${x.after}</strong></td></tr>`))}
            ${raw(list(d.added, (x) => `<tr><td><span class="badge green">${esc(t('stk.new'))}</span></td><td class="strong">${esc(x.model)}</td><td>${esc(x.color || '')}</td><td class="num">${x.quantity}</td></tr>`))}
            ${d.missing.length ? html`<label class="check" style="margin-top:14px"><input type="checkbox" data-deact><span>${t('stk.deactivate')} (${d.missing.length})</span></label>` : ''}
            <div class="form-actions"><button class="btn btn-primary" data-apply>${t('stk.apply')}</button></div>`.s;
          m.body.querySelector('[data-apply]').addEventListener('click', (ev) => {
            const fd2 = new FormData(); fd2.append('file', file); fd2.append('deactivate', m.body.querySelector('[data-deact]')?.checked ? '1' : '0');
            busy(ev.currentTarget, async () => { try { const r = await api('/stock/excel/apply', { method: 'POST', form: fd2 }); toast(`${t('stk.applied')}: +${r.added} · ${r.changed} · ${r.deactivated}`, 'ok', 7000); m.close(); load(); } catch (err) { errToast(err); } });
          });
        } catch (err) { errToast(err); }
      });
    });
  }

  // ---- Excel download (same columns as the upload)
  async function exportExcel(btn) {
    await busy(btn, async () => {
      const { excel } = await import('../services/exports.js');
      const ExcelJS = await excel();
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Inventario');
      ws.columns = ['REFERENCIA', 'MUEBLE', 'POSICIÓN', 'MODELO', 'COLOR', 'ACABADO', 'TAMAÑO DE MUESTRA', '20X20 CUT', 'STANDARD', 'INVENTARIO', 'ACTIVO'].map((h) => ({ header: h, key: h, width: h === 'TAMAÑO DE MUESTRA' ? 24 : 14 }));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF191D20' } };
      for (const r of data.rows) ws.addRow({ REFERENCIA: r.ref, MUEBLE: r.cabinet || '', 'POSICIÓN': r.position || '', MODELO: r.model, COLOR: r.color || '', ACABADO: r.finish || '', 'TAMAÑO DE MUESTRA': r.sampleSize || '', '20X20 CUT': r.kind === 'CUT' ? 'SI' : '', STANDARD: r.kind === 'FULL' ? 'SI' : '', INVENTARIO: r.quantity ?? 0, ACTIVO: r.active === false ? 'NO' : 'SI' });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      saveBlob(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `CESANTONI_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }).catch((e) => errToast(e));
  }

  el.querySelector('[data-add]')?.addEventListener('click', () => editRow(null));
  el.querySelector('[data-import]')?.addEventListener('click', importExcel);
  el.querySelector('[data-export]')?.addEventListener('click', (e) => exportExcel(e.currentTarget));
  await load();
}
