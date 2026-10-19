// Browser build of the PDF helpers (pdfkit standalone, loaded from vendor/). Fonts and logos come from the site.
const A = {};
async function loadAssets() {
  if (A.ready) return;
  const get = async (u) => (await fetch(u)).arrayBuffer();
  if (!window.PDFDocument) await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'vendor/pdfkit.standalone.js'; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  [A.regular, A.head, A.bold, A.mont, A.LOGO, A.LOGO_SOMOS] = await Promise.all(['assets/fonts/Figtree-Regular.ttf', 'assets/fonts/Montserrat-SemiBold.otf', 'assets/fonts/Montserrat-Bold.otf', 'assets/fonts/Montserrat-Regular.otf', 'assets/logo-cesantoni.png', 'assets/logo-somos-logistica.png'].map(get));
  A.ready = true;
}
const C = { ink: '#202324', dark: '#191D20', orange: '#C5532E', grey: '#6B7174', line: '#E4E2DD', soft: '#F7F7F5' };

function newDoc(opts = {}) {
  const doc = new window.PDFDocument({ size: opts.size === 'A4' ? 'A4' : 'LETTER', layout: opts.layout || 'portrait', margins: { top: 54, bottom: 54, left: 48, right: 48 }, bufferPages: true, info: { Title: opts.title || 'CESANTONI', Author: 'CESANTONI Logistics' } });
  doc.registerFont('regular', A.regular);
  doc.registerFont('head', A.head);
  doc.registerFont('bold', A.bold);
  doc.registerFont('mont', A.mont);
  doc.font('regular').fillColor(C.ink);
  return doc;
}

// Header drawn in its own band so logos never overlap content.
function header(doc, title, subtitle) {
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const x = doc.page.margins.left; const y = 36;
  doc.image(A.LOGO, x, y, { fit: [150, 42] }); // 1934x544 keeps its ratio
  doc.image(A.LOGO_SOMOS, x + w - 64, y - 4, { fit: [64, 50] });
  doc.moveTo(x, y + 56).lineTo(x + w, y + 56).lineWidth(2).strokeColor(C.orange).stroke();
  doc.font('bold').fontSize(14).fillColor(C.dark).text(title, x, y + 68, { width: w });
  if (subtitle) doc.font('regular').fontSize(9).fillColor(C.grey).text(subtitle, { width: w });
  doc.moveDown(0.8).fillColor(C.ink);
}

function footer(doc, text) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const x = doc.page.margins.left; const w = doc.page.width - x - doc.page.margins.right;
    const y = doc.page.height - 36;
    const bm = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.font('regular').fontSize(7.5).fillColor(C.grey).text(text, x, y, { width: w - 80, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, x + w - 80, y, { width: 80, align: 'right', lineBreak: false });
    doc.page.margins.bottom = bm;
  }
}

function ensureSpace(doc, h) {
  if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function section(doc, n, title, need = 60) {
  ensureSpace(doc, need);
  doc.moveDown(0.6);
  const x = doc.page.margins.left; const w = doc.page.width - x - doc.page.margins.right;
  const y = doc.y;
  doc.rect(x, y, w, 20).fill(C.soft);
  doc.rect(x, y, 3, 20).fill(C.orange);
  doc.font('head').fontSize(10).fillColor(C.dark).text(`${n ? n + '. ' : ''}${title.toUpperCase()}`, x + 10, y + 5.5, { width: w - 20 });
  doc.y = y + 28; doc.x = x;
  doc.font('regular').fontSize(9).fillColor(C.ink);
}

function kv(doc, pairs, cols = 2) {
  const x0 = doc.page.margins.left; const w = doc.page.width - x0 - doc.page.margins.right;
  const cw = w / cols;
  for (let i = 0; i < pairs.length; i += cols) {
    ensureSpace(doc, 30);
    const y = doc.y; let maxH = 0;
    pairs.slice(i, i + cols).forEach(([k, v], j) => {
      const x = x0 + j * cw;
      doc.font('head').fontSize(7).fillColor(C.grey).text(String(k).toUpperCase(), x, y, { width: cw - 12 });
      doc.font('regular').fontSize(9.5).fillColor(C.ink).text(v === null || v === undefined || v === '' ? 'Not available' : String(v), x, doc.y + 1, { width: cw - 12 });
      maxH = Math.max(maxH, doc.y - y);
    });
    doc.y = y + maxH + 6; doc.x = x0;
  }
}

function table(doc, columns, rows, opts = {}) {
  const x0 = doc.page.margins.left; const w = doc.page.width - x0 - doc.page.margins.right;
  const weights = columns.map((c) => c.w || 1); const tw = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((wt) => (wt / tw) * w);
  const fs = opts.fontSize || 8;
  const drawHead = () => {
    const y = doc.y;
    doc.rect(x0, y, w, 18).fill(C.dark);
    let x = x0;
    columns.forEach((c, i) => { doc.font('head').fontSize(fs - 0.5).fillColor('#FFFFFF').text(c.label, x + 4, y + 5, { width: widths[i] - 8, lineBreak: false, ellipsis: true }); x += widths[i]; });
    doc.y = y + 18;
  };
  drawHead();
  if (!rows.length) { doc.font('regular').fontSize(9).fillColor(C.grey).text('No records for the selected criteria.', x0 + 4, doc.y + 6); doc.moveDown(); return; }
  rows.forEach((r, ri) => {
    const cells = columns.map((c) => { const v = r[c.key]; return v === null || v === undefined || v === '' ? (c.type ? 'N/A' : '—') : c.type === 'usd' ? `$${Number(v).toFixed(2)}` : String(v); });
    doc.font('regular').fontSize(fs);
    const h = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - 8 }))) + 8;
    if (doc.y + h > doc.page.height - doc.page.margins.bottom) { doc.addPage(); drawHead(); }
    const y = doc.y;
    if (ri % 2) doc.rect(x0, y, w, h).fill(C.soft);
    let x = x0;
    cells.forEach((t, i) => { doc.fillColor(C.ink).font('regular').fontSize(fs).text(t, x + 4, y + 4, { width: widths[i] - 8, align: columns[i].type ? 'right' : 'left' }); x += widths[i]; });
    doc.y = y + h; doc.x = x0;
  });
  doc.moveTo(x0, doc.y).lineTo(x0 + w, doc.y).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.moveDown(0.5);
}

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(new Blob(chunks, { type: 'application/pdf' }))); doc.on('error', reject);
    doc.end();
  });
}

export { newDoc, header, footer, section, kv, table, ensureSpace, toBuffer, C, loadAssets };
