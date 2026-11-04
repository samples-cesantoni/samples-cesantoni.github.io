// Carrier monitoring: health of the automatic tracking (Apps Script `rastreo`, every 15 min) and the shipments at risk.
// The script leaves a heartbeat in sc_config/rastreo (d.tracking) on every run; each shipment keeps the last carrier
// scan in shipment.carrierStatus. Nothing here changes data: it only reads and classifies.
const H = 3600e3;
const ACTIVE = ['SHIPPED', 'IN_TRANSIT'];
const AUTO_CARRIERS = ['UPS'];
const parseAt = (x) => { if (!x) return NaN; const s = String(x); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || s.length <= 10 ? s : s); };
const hoursSince = (x, now) => { const t = parseAt(x); return Number.isFinite(t) ? Math.max(0, Math.round(((now - t) / H) * 10) / 10) : null; };

// When the package left: carrier drop-off date, else the moment the status became SHIPPED.
function shippedAt(d, no) {
  const s = d.shipments[no] || {};
  if (s.shipDate) return `${s.shipDate}T12:00:00`;
  const h = (d.statusHistory || []).filter((x) => x.requestNo === no && x.to === 'SHIPPED').map((x) => x.at).sort().pop();
  return h || null;
}

// Heartbeat of the automatic tracking.
function health(d, now = Date.now()) {
  const tr = d.tracking || null;
  if (!tr || !tr.lastRun) return { state: 'UNKNOWN', lastRun: null, minutes: null, tr };
  const minutes = Math.round((now - Date.parse(tr.lastRun)) / 60e3);
  const state = minutes > 45 ? 'DOWN' : tr.gmailError || tr.apiError ? 'DEGRADED' : 'OK';
  return { state, lastRun: tr.lastRun, minutes, tr };
}

// One entry per shipment on the road (or with a tracking number): its risk and the last carrier scan.
function watchList(d, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  const out = [];
  for (const req of Object.values(d.requests)) {
    const s = d.shipments[req.requestNo];
    if (!s || !s.trackingNo || !ACTIVE.includes(req.status)) continue;
    const c = s.carrierStatus || null;
    const auto = AUTO_CARRIERS.includes(s.carrier);
    const sinceShip = hoursSince(shippedAt(d, req.requestNo), now);
    const sinceScan = c ? hoursSince(c.at || c.checkedAt, now) : null;
    let risk = null;
    if (c && c.type === 'X') risk = { kind: 'EXCEPTION', severity: 'CRITICAL', msg: `Carrier exception: ${c.description || 'reported by the carrier'}` };
    else if (s.estimatedDate && s.estimatedDate < today && !s.deliveredAt) risk = { kind: 'ETA_PASSED', severity: 'CRITICAL', msg: `Estimated delivery ${s.estimatedDate} passed without delivery` };
    else if (auto && (!c || c.type === 'M') && sinceShip !== null && sinceShip >= 24) risk = { kind: 'NO_SCAN', severity: 'WARNING', msg: `No carrier scan ${Math.round(sinceShip)} h after shipping` };
    else if (auto && c && sinceScan !== null && ((c.type === 'O' && sinceScan >= 24) || sinceScan >= 48)) risk = { kind: 'STALE', severity: 'WARNING', msg: `No carrier movement in ${Math.round(sinceScan)} h (last: ${c.description})` };
    else if (!auto && sinceShip !== null && sinceShip >= 24) risk = { kind: 'MANUAL', severity: 'INFO', msg: `${s.carrier === 'OTHER' ? s.otherCarrierName || 'Carrier' : s.carrier} is not tracked automatically — check it on the carrier site` };
    out.push({ requestNo: req.requestNo, company: req.company || req.customerName || '', carrier: s.carrier, trackingNo: s.trackingNo, trackingUrl: s.trackingUrl || '', auto, status: req.status, last: c, sinceShip, sinceScan, estimatedDate: s.estimatedDate || '', risk });
  }
  const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  return out.sort((a, b) => (a.risk ? rank[a.risk.severity] : 9) - (b.risk ? rank[b.risk.severity] : 9) || (b.sinceShip || 0) - (a.sinceShip || 0));
}

function monitor(d, now = Date.now()) {
  const list = watchList(d, now);
  const h = health(d, now);
  return { health: h, list, monitored: list.filter((x) => x.auto).length, manual: list.filter((x) => !x.auto).length, atRisk: list.filter((x) => x.risk && x.risk.severity !== 'INFO').length };
}

export { health, watchList, monitor };
