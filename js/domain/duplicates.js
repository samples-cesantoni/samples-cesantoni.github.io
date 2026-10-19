import { norm } from './sheet-parse.js';
import { FINAL_STATUSES } from './catalog.js';

const clean = (s) => norm(s).replace(/[^A-Z0-9]/g, '');
function pairKey(a, b) { return [a, b].sort().join('|'); }

function findDuplicates(d, settings) {
  const active = Object.values(d.requests).filter((r) => !FINAL_STATUSES.includes(r.status));
  const out = [];
  const windowMs = (settings.duplicateWindowDays || 14) * 86400000;
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]; const b = active[j];
      if (Math.abs(new Date(a.createdAt) - new Date(b.createdAt)) > windowMs) continue;
      let score = 0; const reasons = [];
      if (clean(a.customer.email) && clean(a.customer.email) === clean(b.customer.email)) { score += 3; reasons.push('Same customer email'); }
      if (clean(a.customer.company) && clean(a.customer.company) === clean(b.customer.company)) { score += 2; reasons.push('Same company'); }
      if (clean(a.customer.fullName) && clean(a.customer.fullName) === clean(b.customer.fullName)) { score += 1; reasons.push('Same customer name'); }
      if (clean(a.address) && clean(a.address) === clean(b.address)) { score += 3; reasons.push('Same delivery address'); }
      const la = new Set(a.lines.map((l) => clean(l.model) + '|' + clean(l.color)));
      const lb = new Set(b.lines.map((l) => clean(l.model) + '|' + clean(l.color)));
      const common = [...la].filter((x) => lb.has(x)).length;
      if (common && common / Math.max(la.size, lb.size) >= 0.5) {
        const sameQty = a.lines.length === b.lines.length && a.lines.every((l) => b.lines.some((m) => clean(m.model) === clean(l.model) && clean(m.color) === clean(l.color) && m.pieces === l.pieces));
        score += sameQty ? 3 : 2; reasons.push(sameQty ? 'Same products and quantities' : 'Overlapping products / models');
      }
      if (score >= 5) {
        const key = pairKey(a.requestNo, b.requestNo);
        out.push({ key, requests: [a.requestNo, b.requestNo].sort(), score, reasons, decision: d.duplicateDecisions[key] || null });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

export { findDuplicates, pairKey };
