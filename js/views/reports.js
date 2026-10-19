import { api, qs, download } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, options, busy, formData, emptyState } from '../ui.js';
import { barChart, lineChart, chartToPng } from '../charts.js';

export async function render(el, ctx) {
  let id = ctx.query.id || ctx.meta.reports[0].id;
  const opts = await api('/dashboard').then((d) => d.options).catch(() => ({ years: [], companies: [], countries: [], carriers: [] }));
  el.innerHTML = html`<div class="page-head"><div><h1>${t('rep.title')}</h1><p>${t('rep.sub')}</p></div></div>
    <div class="card"><form class="filters" data-f>
      <label class="field search"><span>${t('rep.pick')}</span><select class="input" name="id">${options(ctx.meta.reports.map((r, i) => ({ value: r.id, label: `${i + 1}. ${r.title}` })), id)}</select></label>
      <label class="field"><span>${t('common.from')}</span><input class="input" type="date" name="from"></label>
      <label class="field"><span>${t('common.to')}</span><input class="input" type="date" name="to"></label>
      <label class="field"><span>${t('common.year')}</span><select class="input" name="year">${options(opts.years, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.company')}</span><select class="input" name="company">${options(opts.companies, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.country')}</span><select class="input" name="country">${options(opts.countries, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.carrier')}</span><select class="input" name="carrier">${options(opts.carriers, '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.status')}</span><select class="input" name="status">${options(ctx.meta.statuses.map((s) => ({ value: s, label: t('st.' + s) })), '', { all: t('common.all') })}</select></label>
    </form></div>
    <div class="card"><div class="card-head"><h2 data-title></h2><div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" data-x="pdf">${icon('download')}PDF</button><button class="btn btn-ghost btn-sm" data-x="xlsx">${icon('download')}Excel</button><button class="btn btn-ghost btn-sm" data-x="csv">${icon('download')}CSV</button><button class="btn btn-ghost btn-sm" data-x="png" hidden>${icon('download')}PNG</button></div></div>
      <div class="chart" data-chart hidden style="margin-bottom:16px"></div><div data-table></div></div>`.s;
  const form = el.querySelector('[data-f]');
  let rep;
  const filters = () => { const f = formData(form); delete f.id; return f; };
  const load = async () => {
    id = form.id.value;
    history.replaceState(null, '', `#/reports?id=${id}`);
    rep = await api(`/reports/${id}${qs(filters())}`);
    el.querySelector('[data-title]').textContent = rep.title;
    const ch = el.querySelector('[data-chart]');
    ch.hidden = !rep.chart; el.querySelector('[data-x="png"]').hidden = !rep.chart;
    if (rep.chart) (rep.chart.type === 'line' ? lineChart : barChart)(ch, { labels: rep.rows.map((r) => String(r[rep.chart.label])), series: [{ name: rep.columns.find((c) => c.key === rep.chart.value).label, values: rep.rows.map((r) => r[rep.chart.value]) }], title: rep.title });
    const tb = el.querySelector('[data-table]');
    tb.innerHTML = rep.rows.length ? html`<div class="table-wrap"><table class="t cards"><thead><tr>${raw(rep.columns.map((c) => `<th class="${c.type ? 'num' : ''}">${esc(c.label)}</th>`).join(''))}</tr></thead><tbody>
      ${raw(rep.rows.map((r) => `<tr>${rep.columns.map((c) => { const v = r[c.key]; const txt = v === null || v === undefined || v === '' ? (c.type ? 'N/A' : '—') : c.type === 'usd' ? `USD ${Number(v).toFixed(2)}` : String(v); return `<td data-l="${esc(c.label)}" class="${c.type ? 'num' : ''}">${esc(txt)}</td>`; }).join('')}</tr>`).join(''))}</tbody></table></div>` : emptyState().s;
  };
  el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    if (b.dataset.x === 'png') return chartToPng(el.querySelector('[data-chart]'), `CESANTONI — ${rep.title}`, `CESANTONI_${rep.title.replace(/\W+/g, '_')}.png`);
    return download(`/reports/${id}${qs({ ...filters(), format: b.dataset.x })}`, `${id}.${b.dataset.x}`);
  }).catch(() => {})));
  let timer; form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); }); form.addEventListener('submit', (e) => e.preventDefault());
  await load();
}
