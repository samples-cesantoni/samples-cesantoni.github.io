import { api } from '../api.js';
import { t } from '../i18n.js';
import { html, raw, icon, esc, fmtDate, fmtDay, toast, busy, confirmDialog } from '../ui.js';

export async function render(el, ctx) {
  let s = await api('/settings');
  const sync = await api('/sync/log');
  const se = ctx.session;
  const draw = () => {
    el.innerHTML = html`<div class="page-head"><div><h1>${t('set.title')}</h1><p>${t('set.sub')}</p></div></div>
    <div class="grid g2" style="align-items:start"><div>
      <form class="card" data-hours><div class="card-head"><h2>${t('set.hours')}</h2></div>
        <div class="form-grid"><label class="field"><span>${t('common.from')}</span><input class="input" type="time" name="start" value="${s.businessHours.start}"></label><label class="field"><span>${t('common.to')}</span><input class="input" type="time" name="end" value="${s.businessHours.end}"></label></div>
        <div class="label" style="margin:14px 0 8px">${t('set.days')}</div><div style="display:flex;gap:12px;flex-wrap:wrap">${raw([1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="check"><input type="checkbox" name="d${d}" ${s.businessHours.days.includes(d) ? 'checked' : ''}><span>${esc(t('day.' + d))}</span></label>`).join(''))}</div>
        <div class="label" style="margin:18px 0 8px">${t('set.targets')}</div><div class="form-grid">${raw(Object.entries(s.targets).map(([k, v]) => `<label class="field"><span>${esc(t('t.' + k))}</span><input class="input" type="number" min="1" step="0.5" name="t_${k}" value="${v}"></label>`).join(''))}</div>
        <label class="field" style="margin-top:14px;max-width:220px"><span>${t('set.dupWindow')}</span><input class="input" type="number" min="1" max="90" name="dup" value="${s.duplicateWindowDays}"></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>
      <form class="card" data-hol><div class="card-head"><h2>${t('set.holidays')}</h2></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${raw(s.holidays.map((h) => `<span class="badge">${esc(fmtDay(h))} <button type="button" data-rm="${h}" style="border:0;background:none;cursor:pointer;padding:0 0 0 4px" aria-label="remove">×</button></span>`).join('') || `<span class="muted">${esc(t('common.none'))}</span>`)}</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><input class="input" type="date" name="day" style="max-width:200px"><button class="btn btn-ghost" type="submit">${icon('plus')}${t('set.addHoliday')}</button></div></form>
    </div><div>
      <form class="card" data-car><div class="card-head"><div><h2>${t('set.carriers')}</h2><p>${t('set.carrierHint')}</p></div></div>
        ${raw(Object.entries(s.carriers).filter(([k]) => k !== 'OTHER').map(([k, v]) => `<label class="field" style="margin-bottom:10px"><span>${esc(v.name)}</span><input class="input mono" name="c_${k}" value="${esc(v.trackingUrl)}" placeholder="https://…{n}"></label>`).join(''))}
        <div class="form-actions"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>
      <form class="card" data-mail><div class="card-head"><h2>${t('set.emailMode')}</h2></div>
        <label class="check"><input type="radio" name="emailMode" value="TEST" ${s.emailMode !== 'PRODUCTION' ? 'checked' : ''}><span>${t('set.modeTest')}</span></label>
        <label class="check" style="margin-top:8px"><input type="radio" name="emailMode" value="PRODUCTION" ${s.emailMode === 'PRODUCTION' ? 'checked' : ''} ${se.rol === 'admin' ? '' : 'disabled'}><span>${t('set.modeProd')}</span></label>
        <label class="field" style="margin-top:12px"><span>${t('set.testRecipient')}</span><input class="input" type="email" name="testRecipient" value="${s.testRecipient || ''}"></label>
        <div class="kv" style="margin-top:12px"><div><div class="k">Service</div><div class="v">${se.email.provider === 'NONE' ? 'Not configured' : 'Gmail (Apps Script) · EmailJS backup'}</div></div><div><div class="k">Live sending</div><div class="v">${se.email.live ? 'Yes' : 'No — messages stay queued'}</div></div></div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">${t('common.save')}</button></div></form>
      <div class="card"><div class="card-head"><h2>${t('set.integration')}</h2></div>
        <h3>${t('set.sync')}</h3>
        <div class="kv" style="margin:10px 0 14px"><div><div class="k">Source</div><div class="v small">${sync.meta.source || '—'}</div></div><div><div class="k">Last sync</div><div class="v">${fmtDate(sync.meta.lastSync)}</div></div><div><div class="k">Write-back queue</div><div class="v">${sync.outbox.pending} pending</div></div></div>
        <details style="margin-bottom:14px"><summary class="small">Sync log (${sync.log.length})</summary><div class="small" style="max-height:220px;overflow:auto;margin-top:8px">${raw(sync.log.map((l) => `<div style="padding:4px 0;border-bottom:1px solid var(--line-2)">${esc(fmtDate(l.at))} · <strong>${esc(l.action)}</strong> ${esc(l.requestNo || '')} · ${esc(l.detail || '')}</div>`).join(''))}</div></details>
        <form data-import><h3>${t('set.import')}</h3><p class="hint">${t('set.importSub')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input class="input" type="file" name="file" accept=".xlsx" style="max-width:320px" required><button class="btn btn-dark" type="submit">${icon('upload')}${t('set.importBtn')}</button></div></form>
        <form data-initial style="margin-top:22px"><h3>${t('set.initial')}</h3><p class="hint">${t('set.initialSub')}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input class="input" type="file" name="file" accept=".xlsx" style="max-width:320px" required><button class="btn btn-dark" type="submit">${icon('upload')}${t('set.initialBtn')}</button></div></form>
      </div>
      ${se.rol === 'admin' ? html`<div class="card"><div class="card-head"><div><h2>${t('set.users')}</h2><p>${t('set.usersSub')}</p></div></div><div data-users class="muted">${t('common.loading')}</div>
        <form data-adduser class="form-grid" style="margin-top:14px"><label class="field"><span>${t('login.email')}</span><input class="input" type="email" name="correo" required></label>
          <label class="field"><span>${t('set.role')}</span><select class="input" name="rol"><option value="bodega">${t('role.bodega')}</option><option value="cesantoni">${t('role.cesantoni')}</option><option value="admin">${t('role.admin')}</option></select></label>
          <label class="field"><span>${t('set.tempPw')}</span><input class="input" name="password" autocomplete="new-password"></label>
          <div class="form-actions" style="grid-column:1/-1;margin-top:0"><button class="btn btn-primary" type="submit">${icon('plus')}${t('set.addUser')}</button></div></form></div>` : ''}
      <form class="card" data-pw><div class="card-head"><h2>${t('set.password')}</h2></div><div class="form-grid">
        <label class="field"><span>${t('login.current')}</span><input class="input" type="password" name="actual" autocomplete="current-password" required></label>
        <label class="field"><span>${t('login.new')}</span><input class="input" type="password" name="nueva" autocomplete="new-password" required></label></div>
        <p class="hint">${t('login.pwRule')}</p><div class="form-actions"><button class="btn btn-ghost" type="submit">${t('common.save')}</button></div></form>
      </div></div></div>`.s;
    bind();
  };
  const save = async (patch) => { s = await api('/settings', { method: 'PUT', body: patch }); toast(t('common.saved'), 'ok'); draw(); };
  function bind() {
    el.querySelector('[data-hours]').addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target;
      const targets = Object.fromEntries(Object.keys(s.targets).map((k) => [k, Number(f[`t_${k}`].value)]));
      busy(f.querySelector('[type=submit]'), () => save({ businessHours: { start: f.start.value, end: f.end.value, days: [0, 1, 2, 3, 4, 5, 6].filter((d) => f[`d${d}`].checked) }, targets, duplicateWindowDays: Number(f.dup.value) })).catch(() => {});
    });
    el.querySelector('[data-hol]').addEventListener('submit', (e) => { e.preventDefault(); const d = e.target.day.value; if (d) save({ holidays: [...s.holidays, d] }).catch((x) => toast(x.message, 'err')); });
    el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => save({ holidays: s.holidays.filter((h) => h !== b.dataset.rm) }).catch((x) => toast(x.message, 'err'))));
    el.querySelector('[data-car]').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; const carriers = {}; for (const k of Object.keys(s.carriers)) if (f[`c_${k}`]) carriers[k] = { trackingUrl: f[`c_${k}`].value.trim() }; busy(f.querySelector('[type=submit]'), () => save({ carriers })).catch(() => {}); });
    el.querySelector('[data-mail]').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('[type=submit]'), () => save({ emailMode: f.emailMode.value, testRecipient: f.testRecipient.value.trim() })).catch(() => {}); });
    el.querySelector('[data-import]').addEventListener('submit', (e) => {
      e.preventDefault(); const f = e.target; const fd = new FormData(); fd.append('file', f.file.files[0]);
      busy(f.querySelector('[type=submit]'), async () => { const r = await api('/sync/import', { method: 'POST', form: fd }); toast(`Created ${r.created} · updated ${r.updated} · unchanged ${r.unchanged} · catalog +${r.itemsCreated}`, 'ok', 8000); }).catch(() => {});
    });
    el.querySelector('[data-initial]').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      if (!(await confirmDialog(t('set.initialConfirm')))) return;
      const fd = new FormData(); fd.append('file', f.file.files[0]);
      busy(f.querySelector('[type=submit]'), async () => {
        const r = await api('/inventory/initial', { method: 'POST', form: fd });
        toast(`${t('set.initialDone')}: ${r.matched}/${r.rows} · ${r.itemsChanged} ${t('set.initialItems')}${r.unmatched.length ? ` · ${t('set.initialMissing')}: ${r.unmatched.slice(0, 5).join(', ')}` : ''}`, r.unmatched.length ? 'err' : 'ok', 12000);
      }).catch(() => {});
    });
    el.querySelector('[data-pw]').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('[type=submit]'), async () => { await api('/password', { method: 'POST', body: { actual: f.actual.value, nueva: f.nueva.value } }); f.reset(); toast(t('common.saved'), 'ok'); }).catch(() => {}); });
    if (se.rol === 'admin') {
      const drawUsers = (u) => {
        el.querySelector('[data-users]').innerHTML = html`<div class="table-wrap"><table class="t cards"><thead><tr><th>${t('login.email')}</th><th>${t('set.role')}</th><th>${t('set.active')}</th><th></th></tr></thead><tbody>
          ${raw(u.users.map((x) => html`<tr data-uid="${x.uid}"><td data-l="${t('login.email')}" class="small">${x.correo}</td><td data-l="${t('set.role')}"><select class="input" data-rol style="min-height:32px;padding:4px 8px">${raw(['bodega', 'cesantoni', 'admin'].map((r) => `<option value="${r}" ${r === x.rol ? 'selected' : ''}>${esc(t('role.' + r))}</option>`).join(''))}</select></td><td data-l="${t('set.active')}"><input type="checkbox" data-act ${x.activo ? 'checked' : ''} ${x.me ? 'disabled' : ''}></td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-saveu>${t('common.save')}</button></td></tr>`.s).join(''))}
          ${raw(u.invitations.map((x) => `<tr><td class="small">${esc(x.correo)}</td><td>${esc(t('role.' + x.rol))}</td><td colspan="2" class="small muted">${esc(t('set.invited'))}</td></tr>`).join(''))}</tbody></table></div>`.s;
        el.querySelectorAll('[data-saveu]').forEach((b) => b.addEventListener('click', () => { const tr = b.closest('tr'); busy(b, async () => { drawUsers(await api('/users', { method: 'POST', body: { uid: tr.dataset.uid, rol: tr.querySelector('[data-rol]').value, activo: tr.querySelector('[data-act]').checked } })); toast(t('common.saved'), 'ok'); }).catch(() => {}); }));
      };
      api('/users').then(drawUsers).catch((e) => { el.querySelector('[data-users]').textContent = e.message; });
      el.querySelector('[data-adduser]').addEventListener('submit', (e) => { e.preventDefault(); const f = e.target; busy(f.querySelector('[type=submit]'), async () => { drawUsers(await api('/users', { method: 'POST', body: { correo: f.correo.value, rol: f.rol.value, password: f.password.value } })); f.reset(); toast(t('common.saved'), 'ok'); }).catch(() => {}); });
    }
  }
  draw();
}
