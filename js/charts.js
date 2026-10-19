// Minimal SVG charts (bar, grouped bar, line). They render only supplied data; missing
// values are skipped, never interpolated. Each chart can be exported as PNG.
import { esc, t } from './ui-lite.js';

const COLORS = ['#C5532E', '#191D20', '#8C9196', '#E0A100', '#2E7D4F', '#2B6CB0'];
const W = 640; const H = 260; const PAD = { l: 48, r: 14, t: 16, b: 46 };

function niceMax(v) { if (v <= 0) return 1; const p = 10 ** Math.floor(Math.log10(v)); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
function scaleMax(vals) { const m = Math.max(...vals); return vals.every((v) => Number.isInteger(v)) ? Math.max(4, Math.ceil(m / 4) * 4) : niceMax(m); }
function axis(max, fmt) {
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const y = PAD.t + (H - PAD.t - PAD.b) * (1 - i / 4);
    s += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}" stroke="#ECEAE5" />`;
    s += `<text x="${PAD.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6B7174">${esc(fmt((max * i) / 4))}</text>`;
  }
  return s;
}
const shortLbl = (s) => { s = String(s); return s.length > 12 ? s.slice(0, 11) + '…' : s; };

export function barChart(el, { labels, series, fmt = (v) => Math.round(v * 10) / 10, title }) {
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined);
  if (!labels.length || !vals.length) { el.innerHTML = `<div class="chart-empty">${esc(t('ch.empty'))}</div>`; return; }
  const max = scaleMax(vals);
  const cw = (W - PAD.l - PAD.r) / labels.length;
  const bw = Math.min(38, (cw * 0.7) / series.length);
  let bars = '';
  labels.forEach((lb, i) => {
    series.forEach((s, j) => {
      const v = s.values[i];
      if (v === null || v === undefined) return;
      const h = ((H - PAD.t - PAD.b) * v) / max;
      const x = PAD.l + cw * i + (cw - bw * series.length) / 2 + bw * j;
      bars += `<rect x="${x}" y="${H - PAD.b - h}" width="${bw - 2}" height="${Math.max(h, 0.5)}" rx="3" fill="${s.color || COLORS[j]}"><title>${esc(lb)} · ${esc(s.name)}: ${esc(fmt(v))}</title></rect>`;
      if (series.length === 1 && labels.length <= 14) bars += `<text x="${x + (bw - 2) / 2}" y="${H - PAD.b - h - 5}" text-anchor="middle" font-size="10.5" fill="#4A4F52">${esc(fmt(v))}</text>`;
    });
    bars += `<text x="${PAD.l + cw * i + cw / 2}" y="${H - PAD.b + 16}" text-anchor="middle" font-size="11" fill="#4A4F52">${esc(shortLbl(lb))}</text>`;
  });
  render(el, `${axis(max, fmt)}${bars}`, series, title);
}

export function lineChart(el, { labels, series, fmt = (v) => Math.round(v * 10) / 10, title }) {
  const vals = series.flatMap((s) => s.values).filter((v) => v !== null && v !== undefined);
  if (!labels.length || !vals.length) { el.innerHTML = `<div class="chart-empty">${esc(t('ch.empty'))}</div>`; return; }
  const max = scaleMax(vals);
  const step = labels.length > 1 ? (W - PAD.l - PAD.r - 20) / (labels.length - 1) : 0;
  const X = (i) => PAD.l + 10 + (labels.length > 1 ? step * i : (W - PAD.l - PAD.r) / 2);
  const Y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  let g = '';
  series.forEach((s, j) => {
    const c = s.color || COLORS[j];
    let path = ''; let pen = false;
    s.values.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(i)},${Y(v)} `; pen = true; });
    g += `<path d="${path}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" />`;
    s.values.forEach((v, i) => { if (v !== null && v !== undefined) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="#fff" stroke="${c}" stroke-width="2"><title>${esc(labels[i])} · ${esc(s.name)}: ${esc(fmt(v))}</title></circle>`; });
  });
  labels.forEach((lb, i) => { g += `<text x="${X(i)}" y="${H - PAD.b + 16}" text-anchor="middle" font-size="11" fill="#4A4F52">${esc(shortLbl(lb))}</text>`; });
  render(el, `${axis(max, fmt)}${g}`, series, title);
}

function render(el, inner, series, title) {
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '')}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#fff"/>${inner}<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${H - PAD.b}" y2="${H - PAD.b}" stroke="#C9C5BD"/></svg>${series.length > 1 ? `<div class="legend">${series.map((s, j) => `<span><i style="background:${s.color || COLORS[j]}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}`;
  el.dataset.title = title || 'chart';
}

// Export the chart as PNG with an English title (exports are always English).
export function chartToPng(el, englishTitle, filename) {
  const svg = el.querySelector('svg');
  if (!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute('width', W); clone.setAttribute('height', H);
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.onload = () => {
    const scale = 2; const head = 44;
    const c = document.createElement('canvas'); c.width = W * scale; c.height = (H + head) * scale;
    const g = c.getContext('2d'); g.scale(scale, scale);
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H + head);
    g.fillStyle = '#191D20'; g.font = '600 15px Montserrat, Arial'; g.fillText(englishTitle, 16, 26);
    g.fillStyle = '#C5532E'; g.fillRect(16, 34, 40, 3);
    g.drawImage(img, 0, head, W, H);
    c.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
}
