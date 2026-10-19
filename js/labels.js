// QR + identification labels, generated 100% in the browser (vendored qrcode-generator).
// All printed text is English. No prices, costs or staff data are ever encoded.
const LOGO = 'assets/logo-cesantoni.png';
const SOMOS = 'assets/logo-somos-logistica.png';
const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return imgCache[src];
}

export function qrText(d) {
  if (d.general) {
    return ['CESANTONI SAMPLE IDENTIFICATION', `Request: ${d.requestNo}`, `Products: ${d.lines.length}`, ...d.lines.map((l) => `${l.line}) SKU ${l.sku || 'Not registered'} | ${l.model} | ${l.color} | ${l.pieceSize} | Qty ${l.pieces} | ${l.location || 'Location not assigned'}`)].join('\n');
  }
  return ['CESANTONI SAMPLE IDENTIFICATION', `Request: ${d.requestNo}`, `SKU: ${d.sku || 'Not registered'}`, `Product: ${d.model}`, `Color: ${d.color || '-'}`, `Size: ${d.pieceSize || '-'}`, `Quantity: ${d.pieces}`, `Location: ${d.location || 'Not assigned'}`].join('\n');
}

export function qrMatrix(text) {
  const q = window.qrcode(0, 'M');
  window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
  q.addData(text, 'Byte');
  q.make();
  return q;
}
export function drawQr(canvas, text, px = 600) {
  const q = qrMatrix(text);
  const n = q.getModuleCount(); const quiet = 4; const cell = Math.floor(px / (n + quiet * 2));
  const size = cell * (n + quiet * 2);
  canvas.width = size; canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return canvas;
}

function fit(g, text, maxW, size, weight = 600, family = 'Montserrat') {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}, Arial, sans-serif`; s -= 2; } while (g.measureText(text).width > maxW && s > 18);
  return text;
}
function wrap(g, text, maxW, maxLines) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const test = cur ? `${cur} ${w}` : w; if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
  return lines;
}

// 4 x 6 in at 300 dpi (1200 x 1800 px) — portrait shipping-label proportions.
export async function drawLabel(canvas, d) {
  await document.fonts?.ready;
  const W = 1200; const H = 1800; const M = 70;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const [logo, somos] = await Promise.all([loadImg(LOGO), loadImg(SOMOS)]);
  // header band: logos keep their native aspect ratio
  const lh = 120; const lw = (logo.width / logo.height) * lh;
  g.drawImage(logo, M, 70, lw, lh);
  const sh = 150; const sw = (somos.width / somos.height) * sh;
  g.drawImage(somos, W - M - sw, 55, sw, sh);
  g.fillStyle = '#C5532E'; g.fillRect(M, 235, W - 2 * M, 8);
  g.fillStyle = '#191D20'; g.font = '700 58px Montserrat, Arial'; g.fillText('CESANTONI', M, 320);
  g.fillStyle = '#C5532E'; g.font = '600 40px Montserrat, Arial'; g.fillText('SAMPLE IDENTIFICATION', M, 372);

  const rows = d.general
    ? [['Request Number', d.requestNo], ['Products', `${d.lines.length} line(s) — see list`], ['Total Quantity', `${d.lines.reduce((s, l) => s + (l.pieces || 0), 0)} pcs`], ['Customer Company', d.company || '—']]
    : [['Request Number', d.requestNo], ['SKU', d.sku || 'Not registered'], ['Product', d.model], ['Color', d.color || '—'], ['Size', d.pieceSize || '—'], ['Quantity', `${d.pieces} pcs`], ['Location', d.location || 'Not assigned']];
  let y = 440; const colW = W - 2 * M - 520;
  for (const [k, v] of rows) {
    g.fillStyle = '#6B7174'; g.font = '600 26px Montserrat, Arial'; g.fillText(k.toUpperCase(), M, y);
    g.fillStyle = '#191D20'; fit(g, String(v), colW, 44, 700);
    const lines = wrap(g, String(v), colW, 2);
    lines.forEach((ln, i) => g.fillText(ln, M, y + 50 + i * 48));
    y += 70 + lines.length * 48;
    g.fillStyle = '#ECEAE5'; g.fillRect(M, y - 26, colW, 2);
  }
  if (d.general) {
    g.fillStyle = '#191D20'; g.font = '600 28px Montserrat, Arial'; g.fillText('PRODUCT LIST', M, y + 10);
    g.font = '400 26px Figtree, Arial';
    let yy = y + 56;
    for (const l of d.lines.slice(0, 10)) { const txt = `${l.line}. ${l.model} · ${l.color} · ${l.pieceSize} · ${l.pieces} pcs · ${l.location || 'n/a'}`; wrap(g, txt, W - 2 * M, 1).forEach((ln) => { g.fillText(ln, M, yy); yy += 40; }); }
  }
  // QR on the right
  const qc = document.createElement('canvas'); drawQr(qc, qrText(d), 480);
  g.imageSmoothingEnabled = false;
  g.drawImage(qc, W - M - 480, 410, 480, 480);
  g.fillStyle = '#6B7174'; g.font = '600 22px Montserrat, Arial'; g.textAlign = 'center'; g.fillText('SCAN FOR SAMPLE DATA', W - M - 240, 920); g.textAlign = 'left';
  // footer
  g.fillStyle = '#191D20'; g.fillRect(0, H - 130, W, 130);
  g.fillStyle = '#fff'; fit(g, 'CESANTONI LOGISTICS – INTERNAL SAMPLE IDENTIFICATION', W - 2 * M, 34, 700);
  g.fillText('CESANTONI LOGISTICS – INTERNAL SAMPLE IDENTIFICATION', M, H - 55);
  return canvas;
}

export function canvasToPng(canvas, name) {
  return new Promise((res) => canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); res(); }, 'image/png'));
}

// Print one label per page at the selected physical size.
export async function printLabels(list, size = '4x6') {
  const dims = { '4x6': ['4in', '6in'], '100x150': ['100mm', '150mm'], letter: ['8.5in', '11in'], a4: ['210mm', '297mm'] }[size] || ['4in', '6in'];
  const root = document.getElementById('print-root');
  root.innerHTML = '';
  const style = document.createElement('style');
  const pad = ['letter', 'a4'].includes(size) ? '0.5in' : '0';
  style.textContent = `@page { size: ${dims[0]} ${dims[1]}; margin: 0; } @media print { #print-root .sheet { width: ${dims[0]}; height: ${dims[1]}; padding: ${pad}; box-sizing: border-box; overflow: hidden; } #print-root img { width: 100%; height: 100%; object-fit: contain; } }`;
  root.appendChild(style);
  for (const d of list) {
    const c = document.createElement('canvas'); await drawLabel(c, d);
    const sheet = document.createElement('div'); sheet.className = 'sheet';
    const img = new Image(); img.src = c.toDataURL('image/png'); img.alt = 'label';
    sheet.appendChild(img); root.appendChild(sheet);
  }
  await Promise.all([...root.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; }))));
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.innerHTML = ''; window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (document.body.classList.contains('printing')) done(); }, 60000);
}
