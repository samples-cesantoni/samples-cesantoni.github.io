// Report exports. Titles, headers and generated text are always English.
import { newDoc, header, footer, table, toBuffer, loadAssets } from './pdf-base.js';
async function excel() { if (!window.ExcelJS) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'vendor/exceljs.min.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); return window.ExcelJS; }

const cell = (v) => (v === null || v === undefined ? '' : v);

function toCsv(rep) {
  const q = (v) => { const s = String(cell(v)); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [rep.columns.map((c) => q(c.label)).join(',')];
  for (const r of rep.rows) lines.push(rep.columns.map((c) => q(r[c.key])).join(','));
  return new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

async function toXlsx(rep) {
  const ExcelJS = await excel();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CESANTONI Logistics';
  const ws = wb.addWorksheet(rep.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
  ws.addRow([`CESANTONI — ${rep.title}`]).font = { bold: true, size: 14 };
  ws.addRow([`Generated: ${new Date(rep.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · Filters: ${filterText(rep.filters)}`]).font = { italic: true, size: 9, color: { argb: 'FF6B7174' } };
  ws.addRow([]);
  const head = ws.addRow(rep.columns.map((c) => c.label));
  head.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF191D20' } }; c.alignment = { vertical: 'middle', wrapText: true }; });
  for (const r of rep.rows) ws.addRow(rep.columns.map((c) => (c.type && r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== '' ? Number(r[c.key]) : cell(r[c.key]))));
  rep.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(48, Math.max(12, c.label.length + 2, ...rep.rows.map((r) => String(cell(r[c.key])).length + 2)));
    if (c.type === 'usd') col.numFmt = '"USD" #,##0.00';
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  return new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function filterText(f = {}) {
  const parts = Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(', ') : 'none';
}

async function toPdf(rep, { size } = {}) {
  await loadAssets();
  const wide = rep.columns.length > 6;
  const doc = newDoc({ size, layout: wide ? 'landscape' : 'portrait', title: rep.title });
  header(doc, `CESANTONI — ${rep.title.toUpperCase()}`, `Generated ${new Date(rep.generatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC · Filters: ${filterText(rep.filters)} · Amounts in USD`);
  table(doc, rep.columns, rep.rows, { fontSize: wide ? 7.5 : 8.5 });
  footer(doc, 'CESANTONI LOGISTICS — SAMPLES MANAGEMENT & EVIDENCE CENTER — INTERNAL REPORT');
  return toBuffer(doc);
}

export { toCsv, toXlsx, toPdf, excel };
