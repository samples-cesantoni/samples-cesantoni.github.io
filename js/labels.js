// QR + identification labels, generated 100% in the browser (vendored qrcode-generator).
// All printed text is English. No prices, costs or staff data are ever printed or encoded.
const LOGO = 'assets/logo-cesantoni.png';
const SOMOS = 'assets/logo-somos-logistica.png';
const imgCache = {};
function loadImg(src) {
  if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  return imgCache[src];
}

// The QR opens the platform on the request's inventory deduction (Jr: on that product line).
// It is an internal link: the platform asks for sign-in, so nothing is exposed to whoever scans it.
export function qrText(d) {
  const base = new URL('.', location.href).href.replace(/#.*$/, '');
  return `${base}#/requests/${encodeURIComponent(d.requestNo)}?tab=inventory${d.kind === 'jr' ? `&line=${d.line}` : ''}`;
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

// Logos side by side, scaled together so they never overlap.
function header(g, logo, somos, x, y, maxW, h) {
  const lw0 = (logo.width / logo.height) * h, sw0 = (somos.width / somos.height) * h * 1.15;
  const k = Math.min(1, (maxW - 40) / (lw0 + sw0));
  g.drawImage(logo, x, y + (h * 1.15 - h) * k / 2, lw0 * k, h * k);
  g.drawImage(somos, x + maxW - sw0 * k, y, sw0 * k, h * 1.15 * k);
}
function field(g, k, v, x, y, w, size = 44, lines = 2) {
  g.fillStyle = '#6B7174'; g.font = '600 26px Montserrat, Arial'; g.fillText(k.toUpperCase(), x, y);
  g.fillStyle = '#191D20'; fit(g, String(v), w, size, 700);
  const ls = wrap(g, String(v), w, lines);
  ls.forEach((ln, i) => g.fillText(ln, x, y + size + 6 + i * (size + 4)));
  return y + size + 30 + ls.length * (size + 4);
}
function qr(g, d, x, y, px, caption) {
  const qc = document.createElement('canvas'); drawQr(qc, qrText(d), px);
  g.imageSmoothingEnabled = false; g.drawImage(qc, x, y, px, px); g.imageSmoothingEnabled = true;
  g.fillStyle = '#6B7174'; g.font = `600 ${Math.round(px / 20)}px Montserrat, Arial`; g.textAlign = 'center'; g.fillText(caption, x + px / 2, y + px + Math.round(px / 14)); g.textAlign = 'left';
}

// MASTER: one per box of the request (4 x 6 in at 300 dpi = 1200 x 1800 px).
async function drawMaster(canvas, d) {
  const W = 1200, H = 1800, M = 70;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const [logo, somos] = await Promise.all([loadImg(LOGO), loadImg(SOMOS)]);
  header(g, logo, somos, M, 60, W - 2 * M, 110);
  g.fillStyle = '#C5532E'; g.fillRect(M, 215, W - 2 * M, 8);
  g.fillStyle = '#191D20'; g.fillRect(M, 255, 300, 64);
  g.fillStyle = '#fff'; g.font = '800 38px Montserrat, Arial'; g.fillText('MASTER', M + 24, 301);
  if (d.boxes > 1) { g.fillStyle = '#C5532E'; g.font = '800 44px Montserrat, Arial'; g.textAlign = 'right'; g.fillText(`BOX ${d.box} OF ${d.boxes}`, W - M, 304); g.textAlign = 'left'; }
  g.fillStyle = '#6B7174'; g.font = '600 26px Montserrat, Arial'; g.fillText('REQUEST NUMBER', M, 392);
  g.fillStyle = '#191D20'; g.font = '800 104px Montserrat, Arial'; g.fillText(d.requestNo, M, 490);
  const colW = W - 2 * M - 470;
  let y = 570;
  y = field(g, 'Customer company', d.company || '—', M, y, colW, 40);
  y = field(g, 'Destination', [d.city, d.state, d.country].filter(Boolean).join(', ') || '—', M, y, colW, 40);
  y = field(g, 'Contents', `${d.lines.length} product(s) · ${d.pieces} pcs`, M, y, colW, 40, 1);
  if (d.trackingNo) y = field(g, d.carrier || 'Tracking', d.trackingNo, M, y, colW, 36, 1);
  qr(g, d, W - M - 420, 540, 420, 'SCAN: INVENTORY DEDUCTION');
  y = Math.max(y, 1060);
  g.fillStyle = '#ECEAE5'; g.fillRect(M, y - 20, W - 2 * M, 2);
  g.fillStyle = '#191D20'; g.font = '700 28px Montserrat, Arial'; g.fillText('PRODUCT LIST', M, y + 24);
  let yy = y + 76;
  const max = Math.max(1, Math.floor((H - 170 - yy) / 46));
  for (const l of d.lines.slice(0, max)) {
    g.fillStyle = '#C5532E'; g.font = '700 30px Montserrat, Arial'; g.fillText(String(l.line), M, yy);
    g.fillStyle = '#191D20'; g.font = '600 30px Figtree, Arial';
    const txt = `${l.model}${l.color ? ' · ' + l.color : ''} · ${l.pieceSize || ''} · ${l.pieces} pcs`;
    wrap(g, txt, W - 2 * M - 60, 1).forEach((ln) => g.fillText(ln, M + 50, yy));
    yy += 46;
  }
  if (d.lines.length > max) { g.fillStyle = '#6B7174'; g.font = '600 26px Figtree, Arial'; g.fillText(`+ ${d.lines.length - max} more — scan the QR`, M + 50, yy); }
  g.fillStyle = '#191D20'; g.fillRect(0, H - 120, W, 120);
  g.fillStyle = '#fff'; g.font = '700 32px Montserrat, Arial'; g.fillText('CESANTONI LOGISTICS – SAMPLE SHIPMENT', M, H - 48);
  return canvas;
}

// JR: one per product line, to stick on each sample (4 x 2 in at 300 dpi = 1200 x 600 px).
async function drawJr(canvas, d) {
  const W = 1200, H = 600, M = 40;
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const logo = await loadImg(LOGO);
  const lh = 54; g.drawImage(logo, M, 34, (logo.width / logo.height) * lh, lh);
  g.fillStyle = '#C5532E'; g.fillRect(M, 108, W - 2 * M - 400, 5);
  g.fillStyle = '#191D20'; g.fillRect(W - M - 380 - 96, 34, 86, 50);
  g.fillStyle = '#fff'; g.font = '800 30px Montserrat, Arial'; g.textAlign = 'center'; g.fillText('JR', W - M - 380 - 53, 70); g.textAlign = 'left';
  const colW = W - 2 * M - 420;
  g.fillStyle = '#191D20'; g.font = '800 56px Montserrat, Arial'; g.fillText(d.requestNo, M, 180);
  g.fillStyle = '#C5532E'; g.font = '700 30px Montserrat, Arial'; g.fillText(`LINE ${d.line}`, M, 222);
  g.fillStyle = '#191D20'; fit(g, d.model, colW, 50, 800); wrap(g, d.model, colW, 1).forEach((ln) => g.fillText(ln, M, 290));
  g.fillStyle = '#4A4F52'; fit(g, [d.color, d.pieceSize].filter(Boolean).join(' · ') || '—', colW, 36, 600);
  g.fillText([d.color, d.pieceSize].filter(Boolean).join(' · ') || '—', M, 344);
  g.fillStyle = '#191D20'; g.font = '700 34px Montserrat, Arial'; g.fillText(`${d.pieces} pcs`, M, 410);
  g.fillStyle = '#6B7174'; g.font = '600 24px Montserrat, Arial'; g.fillText('LOCATION', M + 220, 382);
  g.fillStyle = '#191D20'; fit(g, d.location || 'Not assigned', colW - 220, 32, 700); g.fillText(d.location || 'Not assigned', M + 220, 416);
  g.fillStyle = '#6B7174'; g.font = '600 24px Montserrat, Arial'; g.fillText(`SKU ${d.sku || 'not registered'}`, M, 470);
  g.fillStyle = d.deducted ? '#2E7D4F' : '#B26A00'; g.font = '700 24px Montserrat, Arial'; g.fillText(d.deducted ? 'DEDUCTED FROM INVENTORY' : 'NOT DEDUCTED YET', M, 510);
  qr(g, d, W - M - 380, 70, 380, 'SCAN: DEDUCTION');
  g.fillStyle = '#C5532E'; g.fillRect(0, H - 14, W, 14);
  return canvas;
}

export async function drawLabel(canvas, d) {
  await document.fonts?.ready;
  return d.kind === 'jr' ? drawJr(canvas, d) : drawMaster(canvas, d);
}

export function canvasToPng(canvas, name) {
  return new Promise((res) => canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); res(); }, 'image/png'));
}

// Print one label per page at the selected physical size.
export async function printLabels(list, size = '4x6') {
  const dims = { '4x6': ['4in', '6in'], '100x150': ['100mm', '150mm'], '4x2': ['4in', '2in'], '100x50': ['100mm', '50mm'], letter: ['8.5in', '11in'], a4: ['210mm', '297mm'] }[size] || ['4in', '6in'];
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
