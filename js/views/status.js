import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, statusBadge, toast, busy, opKey, mailBadge, confirmDialog, fmtDate } from '../ui.js';
import { requestPicker, timeline } from './shared.js';

export async function render(el, ctx) {
  const s = ctx.session;
  let no = ctx.query.request || '';
  let det = null; let to = ''; let preview = null; let key = opKey();
  el.innerHTML = html`<div class="page-head"><div><h1>${t('stc.title')}</h1><p>${t('stc.sub')}</p></div></div>
    <div class="steps">
      <div class="step-card"><h2>${t('s1')}</h2><div data-picker style="max-width:420px;margin-top:10px" id="stpick"></div></div>
      <div class="step-card" data-s2><h2>${t('s2')}</h2><div data-cur class="muted" style="margin-top:10px">—</div></div>
      <div class="step-card" data-s3><h2>${t('s3')}</h2><div class="status-pick" data-pick style="margin-top:12px"></div></div>
      <div class="step-card" data-s4><h2>${t('s4')}</h2><div data-req style="margin-top:10px" class="muted">—</div></div>
      <div class="step-card" data-s5><h2>${t('s5')}</h2><label class="field" style="margin-top:10px"><textarea class="input" name="notes" maxlength="1000" data-notes></textarea></label><p class="hint">${t('stc.obsHint')}</p></div>
      <div class="step-card" data-s6><h2>${t('s6')}</h2><div data-notify style="margin-top:10px"></div></div>
      <div class="step-card" data-s7><h2>${t('s7')}</h2><div style="margin-top:10px"><button class="btn btn-ghost" data-prev>${icon('eye')}${t('stc.preview')}</button></div><div data-frame style="margin-top:12px"></div></div>
      <div class="step-card" data-s8><h2>${t('s8')}</h2><div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-primary" data-apply style="min-height:46px">${icon('check')}${t('stc.apply')}</button></div><div data-result style="margin-top:14px"></div></div>
    </div>`.s;

  const enable = (on) => ['s2', 's3', 's4', 's5', 's6', 's7', 's8'].forEach((k) => el.querySelector(`[data-${k}]`).classList.toggle('disabled', !on));
  enable(false);

  async function choose(n) {
    no = n; to = ''; preview = null; key = opKey();
    det = await api(`/requests/${encodeURIComponent(no)}`);
    history.replaceState(null, '', `#/status?request=${encodeURIComponent(no)}`);
    enable(true);
    el.querySelector('[data-cur]').innerHTML = html`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">${statusBadge(det.status)}<span class="strong">${det.requestNo}</span><span class="muted">${det.company || det.customerName} · ${t(det.deliveryMode ? 'mode.' + det.deliveryMode : 'mode.none')}</span><a class="small" href="#/requests/${encodeURIComponent(no)}">${t('common.open')} →</a></div>${timeline(det)}`.s;
    el.querySelector('[data-pick]').innerHTML = ctx.meta.statuses.map((x) => `<button type="button" data-to="${x}" ${x === det.status ? 'disabled' : ''}>${esc(t('st.' + x))}</button>`).join('');
    el.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => { to = b.dataset.to; el.querySelectorAll('[data-to]').forEach((x) => x.classList.toggle('on', x === b)); refreshPreview(); }));
    el.querySelector('[data-req]').textContent = '—';
    el.querySelector('[data-frame]').innerHTML = '';
    el.querySelector('[data-result]').innerHTML = '';
    drawNotify();
  }

  function drawNotify() {
    const valid = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/.test(det.customerEmail || '');
    const modeNote = !s.email.live ? t('demo.banner') : s.email.mode !== 'PRODUCTION' ? t('test.banner') : '';
    el.querySelector('[data-notify]').innerHTML = html`${valid ? html`<label class="check"><input type="checkbox" data-notifyck><span>${t('stc.notify')}</span></label>
      <div class="kv" style="margin-top:12px"><div><div class="k">${t('stc.recipient')}</div><div class="v mono">${det.customerEmail}</div></div></div>` : html`<div class="callout warn">${icon('alert')}<span>${t('stc.noEmailMode')}</span></div>`}
      ${modeNote ? html`<div class="callout info" style="margin-top:12px">${icon('info')}<span>${modeNote}</span></div>` : ''}`.s;
  }

  async function refreshPreview() {
    if (!to) return;
    preview = await api('/status/preview', { method: 'POST', body: { requestNo: no, to, notes: el.querySelector('[data-notes]').value } });
    const r = preview.requirements;
    const missing = r.filter((x) => !x.ok);
    el.querySelector('[data-req]').innerHTML = html`<div class="checklist">${r.length ? raw(r.map((x) => `<div class="item"><span class="light ${x.ok ? 'GREEN' : 'RED'}"></span><span class="lbl">${esc(x.label)}</span></div>`).join('')) : ''}</div>
      ${!missing.length ? html`<div class="callout ok" style="margin-top:10px">${icon('check')}<span>${t('stc.reqOk')}</span></div>` : html`<label class="field" style="margin-top:12px"><span>${t('stc.exception')}</span><textarea class="input" data-exc maxlength="500"></textarea></label>`}
      ${preview.warnings.length ? html`<div class="callout warn" style="margin-top:12px">${icon('alert')}<div>${raw(preview.warnings.map((w) => `<div>${esc(w)}</div>`).join(''))}<label class="check" style="margin-top:8px"><input type="checkbox" data-inc><span>${t('stc.inconsistent')}</span></label></div></div>` : ''}`.s;
    el.querySelector('[data-frame]').innerHTML = '';
  }

  el.querySelector('[data-notes]').addEventListener('change', () => { if (to) { const exc = el.querySelector('[data-exc]')?.value; refreshPreview().then(() => { const x = el.querySelector('[data-exc]'); if (x && exc) x.value = exc; }); } });
  el.querySelector('[data-prev]').addEventListener('click', async (ev) => {
    if (!to) { toast(t('s3'), 'err'); return; }
    await busy(ev.currentTarget, async () => {
      const p = await api('/status/preview', { method: 'POST', body: { requestNo: no, to, notes: el.querySelector('[data-notes]').value } });
      el.querySelector('[data-frame]').innerHTML = html`<div class="small muted" style="margin-bottom:6px">${p.email.subject} · → ${p.recipient}</div><iframe class="email-frame" sandbox="" title="Email preview"></iframe>`.s;
      el.querySelector('[data-frame] iframe').srcdoc = p.email.html;
    }).catch(() => {});
  });
  el.querySelector('[data-apply]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!to) { toast(t('s3'), 'err'); return; }
    const notify = Boolean(el.querySelector('[data-notifyck]')?.checked);
    if (!(await confirmDialog(`${t('stc.confirmQ')} ${det.requestNo}: ${t('st.' + det.status)} → ${t('st.' + to)}${notify ? ` · ${t('stc.notify')}` : ''}`))) return;
    await busy(btn, async () => {
      const res = await api('/status/change', { method: 'POST', body: { requestNo: no, to, notes: el.querySelector('[data-notes]').value, notify, opKey: key, exceptionReason: el.querySelector('[data-exc]')?.value || '', confirmInconsistent: Boolean(el.querySelector('[data-inc]')?.checked) } });
      toast(t('stc.done'), 'ok');
      el.querySelector('[data-result]').innerHTML = html`<div class="callout ok">${icon('check')}<div><strong>${t('stc.done')}</strong> · ${fmtDate(res.history.at)} · CESANTONI<br>${raw(statusBadge(res.history.from).s)} → ${raw(statusBadge(res.history.to).s)}</div></div>
        ${res.email ? html`<div class="callout ${res.email.status === 'SENT' ? 'ok' : res.email.status === 'FAILED' ? 'danger' : 'warn'}" style="margin-top:10px">${icon('mail')}<div><strong>${t('stc.emailResult')}:</strong> ${mailBadge(res.email.status)} ${res.email.statusReason || res.email.error || ''}<div style="margin-top:6px"><a href="#/emails">${t('nav.emails')} →</a></div></div></div>` : ''}`.s;
      ctx.refreshBadges();
      const keepResult = el.querySelector('[data-result]').innerHTML;
      await choose(no);
      el.querySelector('[data-result]').innerHTML = keepResult;
    }).catch(async (e) => {
      if (e.code === 'REQUIREMENTS_MISSING' || e.code === 'CONFIRM_INCONSISTENT') { await refreshPreview(); }
    });
  });

  await requestPicker(el.querySelector('[data-picker]'), { value: no, onPick: choose });
  if (no) await choose(no);
}
