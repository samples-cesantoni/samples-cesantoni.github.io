import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, mailBadge, modal, busy, toast, options, emptyState } from '../ui.js';

export async function render(el, ctx) {
  let st = ctx.query.status || '';
  el.innerHTML = html`<div class="page-head"><div><h1>${t('em.title')}</h1><p>${t('em.sub')}</p></div></div>
    ${!ctx.session.email.live ? html`<div class="callout warn" style="margin-bottom:18px">${icon('info')}<span>${t('demo.banner')}</span></div>` : ''}
    <div class="kpis exec-kpis" data-k></div>
    <div class="card"><div class="card-head"><h2 data-count></h2></div><div data-list></div></div>`.s;
  const load = async () => {
    const all = (await api('/emails')).emails;
    if (!ctx.isCurrent()) return;
    const n = (k) => all.filter((e) => e.status === k).length;
    el.querySelector('[data-k]').innerHTML = [['', all.length, ''], ['SENT', n('SENT'), 'green'], ['QUEUED', n('QUEUED'), n('QUEUED') ? 'amber' : ''], ['FAILED', n('FAILED'), n('FAILED') ? 'red' : ''], ...(n('SKIPPED') ? [['SKIPPED', n('SKIPPED'), '']] : [])].map(([k, v, c]) => `<button class="kpi ${c} ${k === st ? 'sel' : ''}" data-st="${k}" style="text-align:left;cursor:pointer"><div class="k">${esc(k ? t('mail.' + k) : t('common.all'))}</div><div class="v">${v}</div></button>`).join('');
    el.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st = b.dataset.st; load(); }));
    const emails = all.filter((e) => !st || e.status === st);
    el.querySelector('[data-count]').textContent = `${emails.length} ${t('em.count')}`;
    const box = el.querySelector('[data-list]');
    if (!emails.length) { box.innerHTML = emptyState(t('common.none'), 'mail').s; return; }
    box.innerHTML = html`<div class="table-wrap"><table class="t cards dense"><thead><tr><th>${t('common.date')}</th><th>${t('em.type')}</th><th>${t('req.title')}</th><th>${t('em.to')}</th><th>${t('em.subject')}</th><th>${t('common.status')}</th><th>${t('em.reason')}</th><th></th></tr></thead><tbody>
      ${raw(emails.map((e) => html`<tr><td data-l="${t('common.date')}" class="small">${fmtDate(e.sentAt || e.createdAt)}</td><td data-l="${t('em.type')}" class="small strong">${t('emt.' + e.type, e.type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()))}</td><td data-l="${t('req.title')}" class="nowrap">${raw(e.requestNos.map((x) => `<a href="#/requests/${encodeURIComponent(x)}">${esc(x)}</a>`).join(', '))}</td><td data-l="${t('em.to')}" class="small mono">${e.to}${e.deliveredTo === 'TEST_RECIPIENT' ? raw(' <span class="badge amber">TEST</span>') : ''}</td><td data-l="${t('em.subject')}" class="small">${e.subject}</td><td data-l="${t('common.status')}">${mailBadge(e.status)}${e.attempts ? raw(` <span class="small muted">×${e.attempts}</span>`) : ''}</td><td data-l="${t('em.reason')}" class="small">${e.statusReason || e.error}</td>
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
  await load();
}
