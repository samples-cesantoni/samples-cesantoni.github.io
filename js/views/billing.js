import { api, qs } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDay, usd, options, modal, toast, busy, formData, viewFile, emptyState, todayIso } from '../ui.js';
import { barChart, chartToPng } from '../charts.js';
import { uploadFile, normalizeFile } from '../media.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
export async function render(el, ctx) {
  const year = String(new Date().getFullYear());
  const carriers = Object.entries(ctx.meta.carriers).map(([k, v]) => ({ value: k, label: v.name }));
  el.innerHTML = html`<div class="page-head"><div><h1>${t('bil.title')}</h1><p>${t('bil.sub')}</p></div><div class="actions"><button class="btn btn-primary" data-new>${icon('plus')}${t('bil.new')}</button></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field"><span>${t('common.year')}</span><select class="input" name="year">${options([String(Number(year) - 1), year, String(Number(year) + 1)], year, { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.month')}</span><select class="input" name="month">${options(MONTHS.map((m) => ({ value: m, label: new Date(2000, m - 1, 1).toLocaleString(undefined, { month: 'long' }) })), '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.carrier')}</span><select class="input" name="carrier">${options(carriers, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('bil.invoiceNo')}</span><input class="input" name="invoiceNo"></label>
      <label class="field"><span>${t('bil.recon')}</span><select class="input" name="reconciliation">${options(['PENDING', 'MATCHED', 'DISPUTED'].map((x) => ({ value: x, label: t('rec.' + x) })), '', { all: t('common.all') })}</select></label>
    </form></div>
    <div class="kpis" data-kpis style="margin-top:18px"></div>
    <div class="card" style="margin-top:18px"><div class="card-head"><h2>${t('ch.invoiced')}</h2><button class="btn btn-ghost btn-sm" data-png>${icon('download')}PNG</button></div><div class="chart" data-chart></div><p class="hint" data-note></p></div>
    <div class="card"><div class="card-head"><h2>${t('bil.invoices')}</h2></div><div data-inv></div></div>
    <div class="card"><div class="card-head"><h2>${t('bil.shipments')}</h2></div><div data-ship></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let data;
  const load = async () => {
    data = await api(`/finance${qs(formData(form))}`);
    const k = data.kpis;
    el.querySelector('[data-kpis]').innerHTML = raw([['bil.k1', usd(k.monthlyInvoicedUsd), 'accent'], ['bil.k2', usd(k.recordedShippingCostsUsd), ''], ['bil.k3', k.pendingInvoices, 'amber'], ['bil.k4', k.matchedShipments, 'green'], ['bil.k5', k.unmatchedShipments, 'red'], ['bil.k6', usd(k.averageCostPerShipmentUsd), '']]
      .map(([l, v, c]) => `<div class="kpi ${c}"><div class="k">${esc(t(l))}</div><div class="v" style="font-size:20px">${v instanceof Object ? v.s ?? v : esc(v)}</div></div>`).join('')).s;
    el.querySelector('[data-note]').textContent = data.note;
    barChart(el.querySelector('[data-chart]'), { labels: data.months.map((m) => m.month), series: [{ name: 'Invoiced USD', values: data.months.map((m) => m.invoicedUsd) }, { name: 'Recorded cost USD', values: data.months.map((m) => m.recordedCostUsd) }], fmt: (v) => Math.round(v), title: t('ch.invoiced') });
    const inv = el.querySelector('[data-inv]');
    inv.innerHTML = data.invoices.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('bil.invoiceNo')}</th><th>${t('bil.issueDate')}</th><th>${t('bil.supplier')}</th><th class="num">${t('bil.amount')}</th><th>${t('bil.related')}</th><th>${t('bil.recon')}</th><th>${t('bil.pdf')}</th><th></th></tr></thead><tbody>
      ${raw(data.invoices.map((i) => html`<tr><td data-l="${t('bil.invoiceNo')}" class="strong">${i.invoiceNo}</td><td data-l="${t('bil.issueDate')}">${fmtDay(i.issueDate)}</td><td data-l="${t('bil.supplier')}">${ctx.meta.carriers[i.carrier]?.name || i.carrier}</td><td data-l="${t('bil.amount')}" class="num">${usd(i.totalUsd)}</td><td data-l="${t('bil.related')}" class="small">${i.requestNos.join(', ') || '—'}${i.requestNos.length > 1 ? raw(`<div class="muted">${esc(t('bil.shared'))}</div>`) : ''}</td><td data-l="${t('bil.recon')}"><span class="badge ${{ PENDING: 'amber', MATCHED: 'green', DISPUTED: 'red' }[i.reconciliation]}">${t('rec.' + i.reconciliation)}</span></td>
        <td data-l="${t('bil.pdf')}">${i.pdfFileId ? html`<button class="btn btn-ghost btn-sm" data-pdf="${i.pdfFileId}">${icon('file')}PDF</button>` : '—'}</td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-edit="${i.id}">${t('common.edit')}</button></td></tr>`.s).join(''))}</tbody></table></div>` : emptyState(t('common.none'), 'invoice').s;
    inv.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => viewFile({ id: b.dataset.pdf, mime: 'application/pdf', name: 'Invoice.pdf' })));
    inv.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editor(data.invoices.find((x) => x.id === b.dataset.edit))));
    const sh = el.querySelector('[data-ship]');
    sh.innerHTML = data.shipments.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.request')}</th><th>${t('common.company')}</th><th>${t('common.carrier')}</th><th>${t('sh.tracking')}</th><th>${t('common.month')}</th><th>${t('bil.criterion')}</th><th class="num">${t('bil.cost')}</th><th>${t('bil.invoiceNo')}</th></tr></thead><tbody>
      ${raw(data.shipments.map((s) => html`<tr><td data-l="${t('common.request')}"><a class="strong" href="#/requests/${encodeURIComponent(s.requestNo)}?tab=ship">${s.requestNo}</a></td><td data-l="${t('common.company')}">${s.company}</td><td data-l="${t('common.carrier')}">${ctx.meta.carriers[s.carrier]?.name || s.carrier || '—'}</td><td data-l="${t('sh.tracking')}" class="mono small">${s.trackingNo || '—'}</td><td data-l="${t('common.month')}">${s.month}</td><td data-l="${t('bil.criterion')}" class="small muted">${s.criterion}</td><td data-l="${t('bil.cost')}" class="num">${usd(s.costUsd)}</td><td data-l="${t('bil.invoiceNo')}">${s.invoice ? s.invoice : raw(`<span class="badge red">${esc(t('bil.k5'))}</span>`)}</td></tr>`.s).join(''))}</tbody></table></div>` : emptyState().s;
  };
  async function editor(inv) {
    const { requests } = await api('/requests');
    const linked = new Set(inv?.requestNos || []);
    const m = modal({ title: inv ? `${t('common.edit')} · ${inv.invoiceNo}` : t('bil.new'), wide: true, body: html`<form class="form-grid" data-inv>
      <label class="field"><span>${t('bil.invoiceNo')}</span><input class="input" name="invoiceNo" required value="${inv?.invoiceNo || ''}"></label>
      <label class="field"><span>${t('bil.issueDate')}</span><input class="input" type="date" name="issueDate" required value="${inv?.issueDate || todayIso()}"></label>
      <label class="field"><span>${t('bil.supplier')}</span><select class="input" name="carrier">${options(carriers, inv?.carrier || '')}</select></label>
      <label class="field"><span>${t('bil.amount')}</span><input class="input" type="number" min="0" step="0.01" name="totalUsd" required value="${inv?.totalUsd ?? ''}"></label>
      <label class="field"><span>${t('bil.recon')}</span><select class="input" name="reconciliation">${options(['PENDING', 'MATCHED', 'DISPUTED'].map((x) => ({ value: x, label: t('rec.' + x) })), inv?.reconciliation || 'PENDING')}</select></label>
      <label class="field"><span>${t('bil.pdf')}</span><input class="input" type="file" accept="application/pdf" name="pdf"></label>
      <label class="field" style="grid-column:1/-1"><span>${t('common.notes')}</span><input class="input" name="notes" value="${inv?.notes || ''}"></label>
      <fieldset style="grid-column:1/-1;border:1px solid var(--line);border-radius:8px;padding:12px;max-height:240px;overflow:auto"><legend class="label">${t('bil.related')}</legend>
        ${raw(requests.map((r) => `<label class="check" style="margin:4px 0"><input type="checkbox" name="rq" value="${esc(r.requestNo)}" ${linked.has(r.requestNo) ? 'checked' : ''}><span>${esc(r.requestNo)} · ${esc(r.company || r.customerName)} · ${esc(t('st.' + r.status))}${r.trackingNo ? ` · ${esc(r.trackingNo)}` : ''}</span></label>`).join(''))}</fieldset>
      <p class="hint" style="grid-column:1/-1">${t('bil.shared')}. USD.</p></form>`.s, foot: `<button class="btn btn-ghost" data-close>${esc(t('common.cancel'))}</button><button class="btn btn-primary" data-save>${esc(t('common.save'))}</button>` });
    const f = m.body.querySelector('form');
    m.el.querySelector('[data-save]').addEventListener('click', (e) => busy(e.currentTarget, async () => {
      if (!f.reportValidity()) return;
      let pdfFileId;
      if (f.pdf.files[0]) { const n = await normalizeFile(f.pdf.files[0]); pdfFileId = (await uploadFile(null, n, 'INVOICE')).id; }
      const body = { invoiceNo: f.invoiceNo.value.trim(), issueDate: f.issueDate.value, carrier: f.carrier.value, totalUsd: f.totalUsd.value, reconciliation: f.reconciliation.value, notes: f.notes.value, requestNos: [...f.querySelectorAll('[name=rq]:checked')].map((x) => x.value), pdfFileId };
      await api(inv ? `/invoices/${inv.id}` : '/invoices', { method: inv ? 'PUT' : 'POST', body });
      toast(t('common.saved'), 'ok'); m.close(); load();
    }).catch(() => {}));
  }
  el.querySelector('[data-new]').addEventListener('click', () => editor(null));
  el.querySelector('[data-png]').addEventListener('click', () => chartToPng(el.querySelector('[data-chart]'), 'CESANTONI — Invoiced vs Recorded Shipping Cost by Month (USD)', 'CESANTONI_Billing_by_Month.png'));
  let timer; form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); }); form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}
