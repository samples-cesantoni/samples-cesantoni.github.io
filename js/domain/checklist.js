import { CHECKLISTS, FLOW } from './catalog.js';

function activeEvidence(d, requestNo) {
  return d.evidence.filter((e) => e.requestNo === requestNo && !e.supersededBy);
}
function effectiveStatus(req) {
  return ['ON_HOLD', 'CANCELLED'].includes(req.status) ? (req.lastActiveStatus || 'RECEIVED') : req.status;
}
function reached(req, status) {
  const flow = FLOW[req.deliveryMode] || FLOW.null;
  const cur = flow.indexOf(effectiveStatus(req));
  const target = flow.indexOf(status);
  if (target < 0) {
    // e.g. SHIPPED for pickup flow: treat as due once delivered
    return cur >= flow.indexOf('DELIVERED');
  }
  return cur >= target;
}

function checklist(d, req) {
  const mode = req.deliveryMode;
  const defs = mode ? CHECKLISTS[mode] : CHECKLISTS.COURIER.filter((i) => ['PREPARATION', 'PACKAGING'].includes(i.key));
  const ev = activeEvidence(d, req.requestNo);
  const ship = d.shipments[req.requestNo] || {};
  const items = defs.map((def) => {
    let state = 'MISSING';
    let evidenceIds = [];
    if (def.data) {
      state = ship[def.data] ? 'COMPLETE' : 'MISSING';
    } else {
      const matches = ev.filter((e) => (def.types ? def.types.includes(e.type) : e.stage === def.stage));
      evidenceIds = matches.map((e) => e.id);
      if (matches.some((e) => e.state === 'APPROVED')) state = 'APPROVED';
      else if (matches.some((e) => e.state === 'PENDING')) state = 'PENDING_REVIEW';
      else if (matches.some((e) => e.state === 'RETURNED')) state = 'RETURNED';
    }
    return { key: def.key, label: def.label, critical: def.critical, due: reached(req, def.dueFrom), dueFrom: def.dueFrom, state, evidenceIds };
  });
  const present = items.filter((i) => ['APPROVED', 'COMPLETE', 'PENDING_REVIEW'].includes(i.state)).length;
  const complete = items.every((i) => ['APPROVED', 'COMPLETE'].includes(i.state));
  let light = 'AMBER';
  if (items.some((i) => i.critical && i.due && ['MISSING', 'RETURNED'].includes(i.state))) light = 'RED';
  else if (mode && complete) light = 'GREEN';
  return {
    mode, modeMissing: !mode, items,
    pct: items.length ? Math.round((present / items.length) * 100) : 0,
    documented: Boolean(mode) && complete, light,
  };
}

export { checklist, activeEvidence, effectiveStatus, reached };
