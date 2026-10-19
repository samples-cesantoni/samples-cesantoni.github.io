import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, fmtDate, mailBadge, modal, busy, toast, options, emptyState } from '../ui.js';

export async function render(el, ctx) {
  el.innerHTML = html`<div class="page-head"><div><h1>${t('em.title')}</h1><p>${t('em.sub')}</p></div>
    <label class="field" style="width:200px"><span>${t('common.status')}</span><select class="input" data-st>${options(['SENT', 'QUEUED', 'FAILED'].map((s) => ({ value: s, label: t('mail.' + s) })), ctx.query.status || '', { all: t('common.all') })}</select></label></div>
    ${!ctx.session.email.live ? html`<div class="callout warn" style="margin-bottom:18px">${icon('info')}<span>${t('demo.banner')}</span></div>` : ''}
    <div class="card" data-list></div>`.s;
  const load = async () => {
    const st = el.querySelector('[data-st]').value;
    const { emails } = await api(`/emails${st ? `?status=${st}` : ''}`);
    const box = el.querySelector('[data-list]');
    if (!emails.length) { box.innerHTML = emptyState(t('common.none'), 'mail').s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('common.date')}</th><th>${t('em.type')}</th><th>${t('req.title')}</th><th>${t('em.to')}</th><th>${t('em.subject')}</th><th>${t('common.status')}</th><th>${t('em.reason')}</th><th></th></tr></thead><tbody>
      ${raw(emails.map((e) => html`<tr><td data-l="${t('common.date')}" class="small">${fmtDate(e.sentAt || e.createdAt)}</td><td data-l="${t('em.type')}">${e.type.replace(/_/g, ' ')}</td><td data-l="${t('req.title')}">${e.requestNos.join(', ')}</td><td data-l="${t('em.to')}" class="small mono">${e.to}${e.deliveredTo === 'TEST_RECIPIENT' ? raw(' <span class="badge amber">TEST</span>') : ''}</td><td data-l="${t('em.subject')}" class="small">${e.subject}</td><td data-l="${t('common.status')}">${mailBadge(e.status)}${e.attempts ? raw(` <span class="small muted">×${e.attempts}</span>`) : ''}</td><td data-l="${t('em.reason')}" class="small">${e.statusReason || e.error}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn btn-ghost btn-sm" data-view="${e.id}">${t('common.view')}</button> ${e.status !== 'SENT' ? html`<button class="btn btn-primary btn-sm" data-retry="${e.id}">${t('mail.retry')}</button>` : ''}</td></tr>`.s).join(''))}</tbody></table></div>`.s;
    box.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', async () => {
      const e = await api(`/emails/${b.dataset.view}`);
      const m = modal({ title: e.subject, wide: true, body: `<iframe class="email-frame" sandbox="" title="Email"></iframe>` });
      m.body.querySelector('iframe').srcdoc = e.html;
    }));
    box.querySelectorAll('[data-retry]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
      const r = await api(`/emails/${b.dataset.retry}/retry`, { method: 'POST' });
      toast(`${t('mail.' + r.status)} ${r.statusReason || r.error || ''}`, r.status === 'SENT' ? 'ok' : 'err', 7000);
      load(); ctx.refreshBadges();
    }).catch(() => {})));
  };
  el.querySelector('[data-st]').addEventListener('change', load);
  await load();
}
