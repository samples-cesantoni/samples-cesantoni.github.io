// Time-zone aware helpers and business-time calculation (working hours, weekends,
// holidays and registered closures). Everything is computed from real timestamps.

function tzOffsetMinutes(date, timeZone) {
  const s = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value; // "GMT-06:00"
  const m = s.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}
// A wall-clock time in `timeZone` -> real UTC Date.
function zonedToUtc(y, mo, d, h, mi, timeZone, s = 0) {
  const guess = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const off = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60000);
}
// Spreadsheet "naive" date (wall-clock stored as if UTC) -> real instant.
function naiveToInstant(naive, timeZone) {
  return zonedToUtc(naive.getUTCFullYear(), naive.getUTCMonth() + 1, naive.getUTCDate(),
    naive.getUTCHours(), naive.getUTCMinutes(), timeZone, naive.getUTCSeconds());
}
function serialToInstant(serial, timeZone) {
  return naiveToInstant(new Date(Math.round((serial - 25569) * 86400000)), timeZone);
}
function localParts(date, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, wd, h: +p.hour, mi: +p.minute, iso: `${p.year}-${p.month}-${p.day}` };
}
function addDaysIso(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dateRange(startIso, endIso) {
  const out = [];
  for (let d = startIso; d <= endIso && out.length < 400; d = addDaysIso(d, 1)) out.push(d);
  return out;
}

// Business minutes between two instants.
// closedDates: Set of YYYY-MM-DD (holidays + closures registered as notices).
function businessMinutes(start, end, { businessHours, timeZone, closedDates }) {
  start = new Date(start); end = new Date(end);
  if (!(end > start)) return 0;
  const [sh, sm] = businessHours.start.split(':').map(Number);
  const [eh, em] = businessHours.end.split(':').map(Number);
  let total = 0;
  const first = localParts(start, timeZone).iso;
  const last = localParts(end, timeZone).iso;
  for (const iso of dateRange(first, last)) {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!businessHours.days.includes(wd) || closedDates.has(iso)) continue;
    const open = zonedToUtc(y, m, d, sh, sm, timeZone);
    const close = zonedToUtc(y, m, d, eh, em, timeZone);
    const a = Math.max(open.getTime(), start.getTime());
    const b = Math.min(close.getTime(), end.getTime());
    if (b > a) total += (b - a) / 60000;
  }
  return Math.round(total);
}

function fmtLocal(date, timeZone, withTime = true) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: 'short', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(new Date(date));
}
function monthKey(date, timeZone) {
  const p = localParts(new Date(date), timeZone);
  return `${p.y}-${String(p.m).padStart(2, '0')}`;
}

export { tzOffsetMinutes, zonedToUtc, naiveToInstant, serialToInstant, localParts, addDaysIso, dateRange, businessMinutes, fmtLocal, monthKey };
