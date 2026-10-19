import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, fmtDay, options, toast, busy, opKey, mailBadge, confirmDialog, todayIso, formData, emptyState } from '../ui.js';

export async function render(el, ctx) {
  const { requests } = await api('/requests?active=1');
  const today = todayIso();
  el.innerHTML = html`<div class="page-head"><div><h1>${t('nt.title')}</h1><p>${t('nt.sub')}</p></div></div>
  <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-head"><h2>${t('nt.new')}</h2></div>
    <form data-form class="form-grid" novalidate>
      <label class="field"><span>${t('nt.type')}</span><select class="input" name="category">${options(ctx.meta.noticeCategories.map((c) => ({ value: c, label: t('cat.' + c) })), 'PUBLIC_HOLIDAY')}</select></label>
      <label class="field"><span>${t('nt.start')}</span><input class="input" type="date" name="start" value="${today}" required></label>
      <label class="field"><span>${t('nt.end')}</span><input class="input" type="date" name="end" value="${today}" required></label>
      <label class="field" style="grid-column:1/-1"><span>${t('nt.message')}</span><textarea class="input" name="message" rows="4" maxlength="1500">${t('nt.example')}</textarea></label>
      <fieldset style="grid-column:1/-1;border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:8px">${t('nt.scope')}</legend>
        <label class="check"><input type="radio" name="scope" value="ALL_ACTIVE" checked><span>${t('nt.allActive')}</span></label>
        <label class="check" style="margin-top:8px"><input type="radio" name="scope" value="ONE"><span>${t('nt.one')}</span></label>
        <select class="input" name="requestNo" style="margin-top:8px" disabled>${options(requests.map((r) => ({ value: r.requestNo, label: `${r.requestNo} · ${r.company || r.customerName}` })), '', { all: t('common.select') })}</select>
      </fieldset>
      <label class="field"><span>${t('common.country')}</span><select class="input" name="country">${options([...new Set(requests.map((r) => r.country).filter(Boolean))], '', { all: t('common.all') })}</select></label>
      <label class="field"><span>${t('common.mode')}</span><select class="input" name="deliveryMode">${options(ctx.meta.deliveryModes.map((m) => ({ value: m, label: t('mode.' + m) })), '', { all: t('common.all') })}</select></label>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" name="notify" value="1"><span>${t('nt.notify')}</span></label>
      <div data-notifyopts style="grid-column:1/-1" hidden class="form-grid">
        <label class="field"><span>${t('nt.initial')}</span><input class="input" type="date" name="initialSendDate" value="${today}"></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="remind" value="1"><span>${t('nt.reminders')}</span></label>
        <label class="field"><span>${t('nt.freq')}</span><input class="input" type="number" min="1" max="30" name="frequencyDays" value="2"></label>
        <label class="field"><span>${t('nt.until')}</span><input class="input" type="date" name="until" value="${today}"></label>
      </div>
      <div class="form-actions" style="grid-column:1/-1"><button class="btn btn-ghost" type="button" data-preview>${icon('eye')}${t('nt.preview')}</button><button class="btn btn-primary" type="submit">${icon('bell')}${t('nt.register')}</button></div>
    </form></div>
    <div class="card"><div class="card-head"><h2>${t('nt.recipients')}</h2></div><div data-aud class="muted">—</div><div data-frame style="margin-top:12px"></div></div>
  </div>
  <div class="card"><div class="card-head"><h2>${t('nt.history')}</h2></div><div data-hist></div></div>`.s;

  const f = el.querySelector('[data-form]');
  const sync = () => { f.requestNo.disabled = f.scope.value !== 'ONE'; el.querySelector('[data-notifyopts]').hidden = !f.notify.checked; f.frequencyDays.disabled = f.until.disabled = !f.remind.checked; };
  f.addEventListener('change', sync); sync();
  f.end.addEventListener('change', () => { if (f.until.value > f.end.value || !f.remind.checked) f.until.value = f.end.value; });
  const body = () => {
    const d = formData(f);
    return { category: d.category, start: d.start, end: d.end, message: d.message, scope: d.scope, requestNo: d.scope === 'ONE' ? d.requestNo : null, country: d.country, deliveryMode: d.deliveryMode, notify: Boolean(d.notify), initialSendDate: d.initialSendDate, reminder: { enabled: Boolean(d.remind && d.notify), frequencyDays: Number(d.frequencyDays), until: d.until || d.end } };
  };
  const preview = async () => {
    const p = await api('/notices/preview', { method: 'POST', body: body() });
    el.querySelector('[data-aud]').innerHTML = html`<div class="strong" style="margin-bottom:8px">${p.recipients.length} ${t('em.to').toLowerCase()} · ${p.recipients.reduce((s, r) => s + r.requestNos.length, 0)} ${t('req.count')}</div>
      ${p.recipients.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>${t('em.to')}</th><th>${t('common.customer')}</th><th>${t('req.title')}</th></tr></thead><tbody>${raw(p.recipients.map((r) => `<tr><td class="small mono">${esc(r.email)}</td><td>${esc(r.customerName || '—')}</td><td>${esc(r.requestNos.join(', '))}</td></tr>`).join(''))}</tbody></table></div>` : ''}
      ${p.excluded.length ? html`<details style="margin-top:10px"><summary class="small">${t('nt.excluded')} (${p.excluded.length})</summary><div class="small muted">${p.excluded.map((x) => `${x.requestNo}: ${x.reason}`).join(' · ')}</div></details>` : ''}`.s;
    el.querySelector('[data-frame]').innerHTML = html`<div class="small muted" style="margin-bottom:6px">${p.email.subject}</div><iframe class="email-frame" sandbox="" title="Email preview"></iframe>`.s;
    el.querySelector('[data-frame] iframe').srcdoc = p.email.html;
    return p;
  };
  el.querySelector('[data-preview]').addEventListener('click', (e) => busy(e.currentTarget, preview).catch(() => {}));
  let key = opKey();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]');
    let p; try { p = await preview(); } catch (err) { toast(err.message, 'err'); return; }
    const b = body();
    const msg = b.notify ? `${t('nt.register')}: ${t('cat.' + b.category)} · ${p.recipients.length} ${t('em.to').toLowerCase()}` : `${t('nt.register')}: ${t('cat.' + b.category)}`;
    if (!(await confirmDialog(msg))) return;
    busy(btn, async () => {
      const res = await api('/notices', { method: 'POST', body: { ...b, opKey: key } });
      key = opKey();
      const sent = res.emails.filter((x) => x.status === 'SENT').length;
      toast(`${t('common.saved')} · ${t('mail.SENT')}: ${sent} / ${res.emails.length}`, sent === res.emails.length ? 'ok' : 'info', 7000);
      hist();
    }).catch(() => {});
  });

  async function hist() {
    const { notices } = await api('/notices');
    const box = el.querySelector('[data-hist]');
    if (!notices.length) { box.innerHTML = emptyState(t('common.none'), 'bell').s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('nt.type')}</th><th>${t('nt.start')} – ${t('nt.end')}</th><th>${t('nt.scope')}</th><th>${t('req.title')}</th><th>${t('nav.emails')}</th><th>${t('nt.next')}</th><th>${t('common.status')}</th><th></th></tr></thead><tbody>
      ${raw(notices.map((n) => html`<tr><td data-l="${t('nt.type')}"><span class="strong">${t('cat.' + n.category)}</span><div class="small muted">${n.message.slice(0, 90)}${n.message.length > 90 ? '…' : ''}</div><div class="small muted">${fmtDate(n.createdAt)} · CESANTONI</div></td>
        <td data-l="${t('nt.start')}">${fmtDay(n.start)} – ${fmtDay(n.end)}</td><td data-l="${t('nt.scope')}">${n.scope === 'ONE' ? t('nt.one') : t('nt.allActive')}</td><td data-l="${t('req.title')}" class="small">${n.requestNos.join(', ') || '—'}</td>
        <td data-l="${t('nav.emails')}">${n.notify ? raw(['SENT', 'QUEUED', 'FAILED'].map((s) => { const c = n.emails.filter((x) => x.status === s).length; return c ? `${mailBadge(s).s} ${c}` : ''; }).join(' ') || '—') : '—'}</td>
        <td data-l="${t('nt.next')}">${n.nextRunDate ? fmtDay(n.nextRunDate) : '—'}${n.reminder.enabled ? raw(`<div class="small muted">${esc(t('nt.freq'))}: ${n.reminder.frequencyDays} · ${esc(t('nt.until'))} ${esc(fmtDay(n.reminder.until))}${n.reminder.stopped ? ' · stopped' : ''}</div>`) : ''}</td>
        <td data-l="${t('common.status')}"><span class="badge ${n.status === 'ACTIVE' ? 'green' : ''}">${n.status}</span></td>
        <td style="text-align:right;white-space:nowrap">${n.status === 'ACTIVE' && n.reminder.enabled && !n.reminder.stopped ? html`<button class="btn btn-ghost btn-sm" data-stop="${n.id}">${t('nt.stop')}</button>` : ''} ${n.status === 'ACTIVE' ? html`<button class="btn btn-danger btn-sm" data-cancel="${n.id}">${t('nt.cancelNotice')}</button>` : ''}</td></tr>`.s).join(''))}</tbody></table></div>`.s;
    box.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', () => busy(b, async () => { await api(`/notices/${b.dataset.stop}/stop-reminders`, { method: 'POST' }); hist(); }).catch(() => {})));
    box.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', async () => { if (await confirmDialog(t('nt.cancelNotice') + '?', { danger: true })) busy(b, async () => { await api(`/notices/${b.dataset.cancel}/cancel`, { method: 'POST' }); hist(); }).catch(() => {}); }));
  }
  await hist();
}
