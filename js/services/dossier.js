// Per-request evidence dossier (English). The "financial" variant is CESANTONI-only;
// the standard variant never contains costs or invoices.
import { newDoc, header, footer, section, kv, table, ensureSpace, toBuffer, C, loadAssets } from './pdf-base.js';
import { STATUS_LABEL, DELIVERY_MODE_LABEL, EVIDENCE_LABEL, CARRIERS } from '../domain/catalog.js';
import { fmtLocal } from '../domain/time.js';

async function buildDossier(ctx, det, { size, financial }) {
  await loadAssets();
  const tz = ctx.config.timeZone;
  const d = ctx.store.data;
  const f = (iso) => (iso ? fmtLocal(iso, tz) : 'Not available');
  const doc = newDoc({ size, title: `Evidence report ${det.requestNo}` });
  header(doc, 'CESANTONI – SAMPLE REQUEST EVIDENCE REPORT', `Request ${det.requestNo} · Generated ${fmtLocal(new Date(), tz)} (${tz})${financial ? ' · INTERNAL VERSION WITH FINANCIAL DATA — CESANTONI ONLY' : ''}`);

  section(doc, 1, 'Request information');
  kv(doc, [['Request number', det.requestNo], ['Request date', f(det.createdAt)], ['Current status', STATUS_LABEL[det.status]], ['Delivery mode', DELIVERY_MODE_LABEL[det.deliveryMode] || 'Not defined'], ['Documentation', `${det.checklist.pct}%`], ['Dossier complete', det.checklist.documented ? 'Yes' : 'No']], 3);

  section(doc, 2, 'Customer and delivery information');
  kv(doc, [['Customer', det.customerName], ['Company', det.company], ['Phone', det.phone], ['Country', det.country], ['State / Province', det.state], ['City', det.city], ['ZIP code', det.zip], ['Delivery address', det.address], ['Delivery references', det.deliveryRefs]], 3);

  section(doc, 3, 'Requested products');
  table(doc, [{ key: 'line', label: 'Line', w: 0.5 }, { key: 'model', label: 'Model', w: 2 }, { key: 'color', label: 'Color', w: 1.4 }, { key: 'pieceSize', label: 'Size', w: 1.8 }, { key: 'location', label: 'Location', w: 1.6 }], det.lines);

  section(doc, 4, 'SKU and quantities');
  table(doc, [{ key: 'line', label: 'Line', w: 0.5 }, { key: 'sku', label: 'SKU', w: 1.5 }, { key: 'model', label: 'Product', w: 2 }, { key: 'pieces', label: 'Requested', w: 1, type: 'n' }, { key: 'reservedQty', label: 'Reserved / Issued', w: 1.2, type: 'n' }],
    det.lines.map((l) => ({ ...l, sku: l.sku || 'Not registered' })));

  const evBy = (pred) => det.evidence.filter((e) => !e.supersededBy && pred(e));
  section(doc, 5, 'Preparation evidence', 240); await photos(doc, ctx, evBy((e) => e.stage === 'PREPARATION'), tz);
  section(doc, 6, 'Packaging evidence', 240); await photos(doc, ctx, evBy((e) => e.stage === 'PACKAGING'), tz);

  section(doc, 7, 'Shipping information');
  const s = det.shipment || {};
  kv(doc, [['Carrier', s.carrier === 'OTHER' ? s.otherCarrierName : CARRIERS[s.carrier]?.name || s.carrier], ['Tracking number', s.trackingNo], ['Carrier drop-off date', s.shipDate], ['Shipping method', s.deliveryMethod],
    ['Estimated delivery', s.estimatedDate ? `${s.estimatedDate}${s.estimateConfirmed ? ' (carrier-confirmed)' : ' (estimate, not confirmed)'}` : ''], ['Actual delivery', s.deliveredAt ? f(s.deliveredAt) : ''], ['Delivery result', (s.deliveryResult || '').replace(/_/g, ' ')], ['Tracking link', s.trackingUrl]], 2);

  section(doc, 8, 'Tracking label', 240); await photos(doc, ctx, evBy((e) => e.type === 'SHIPPING_LABEL_PHOTO' || e.type === 'CARRIER_DROPOFF_PROOF'), tz);
  section(doc, 9, 'Delivery proof', 240); await photos(doc, ctx, evBy((e) => ['DELIVERY', 'PICKUP', 'WAREHOUSE_DELIVERY'].includes(e.stage)), tz);

  section(doc, 10, 'Evidence validation');
  table(doc, [{ key: 'type', label: 'Evidence', w: 2 }, { key: 'uploaded', label: 'Uploaded', w: 1.4 }, { key: 'area', label: 'Area', w: 0.9 }, { key: 'state', label: 'Validation', w: 1 }, { key: 'review', label: 'Review notes', w: 2.2 }],
    det.evidence.map((e) => ({ type: `${EVIDENCE_LABEL[e.type]}${e.supersededBy ? ' (superseded)' : ''}`, uploaded: f(e.uploadedAt), area: e.area === 'BODEGA' ? 'Warehouse' : e.area, state: e.state, review: e.review ? `${e.review.notes || '—'} (${f(e.review.at)})` : 'Pending' })));

  section(doc, 11, 'Operational observations');
  const obs = [...(det.sourceNotes ? [{ at: det.createdAt, area: 'Source request', text: det.sourceNotes }] : []), ...det.observationsList];
  table(doc, [{ key: 'at', label: 'Date', w: 1.2 }, { key: 'area', label: 'Area', w: 0.9 }, { key: 'text', label: 'Observation', w: 4 }], obs.map((o) => ({ ...o, at: f(o.at), area: o.area === 'BODEGA' ? 'Warehouse' : o.area })));
  if (det.notices.length) table(doc, [{ key: 'n', label: 'Operational notice', w: 1.5 }, { key: 'p', label: 'Period', w: 1.5 }, { key: 'm', label: 'Message', w: 4 }], det.notices.map((n) => ({ n: n.category.replace(/_/g, ' '), p: `${n.start} – ${n.end}`, m: n.message })));

  section(doc, 12, 'Status history');
  table(doc, [{ key: 'at', label: 'Date', w: 1.3 }, { key: 'change', label: 'Change', w: 2 }, { key: 'area', label: 'Area', w: 0.9 }, { key: 'notes', label: 'Notes', w: 2.6 }],
    det.history.map((h) => ({ at: f(h.at), change: h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : STATUS_LABEL[h.to], area: h.area, notes: [h.notes, h.exception ? `Authorized exception: ${h.exception.reason}` : ''].filter(Boolean).join(' · ') })));

  if (financial) {
    section(doc, null, 'Internal financial information (CESANTONI only)');
    kv(doc, [['Shipping cost (USD)', det.cost?.amountUsd !== null && det.cost?.amountUsd !== undefined ? `$${det.cost.amountUsd.toFixed(2)}` : ''], ['Invoices', (det.invoices || []).map((i) => `${i.invoiceNo} (${i.issueDate}, total $${i.totalUsd.toFixed(2)}${i.sharedWith > 1 ? `, shared by ${i.sharedWith} requests` : ''})`).join('; ')]], 2);
  }

  section(doc, 13, 'Documentation summary');
  table(doc, [{ key: 'label', label: 'Required item', w: 3 }, { key: 'critical', label: 'Critical', w: 0.8 }, { key: 'state', label: 'Status', w: 1.4 }],
    det.checklist.items.map((i) => ({ label: i.label, critical: i.critical ? 'Yes' : 'No', state: i.state.replace('_', ' ') })));
  ensureSpace(doc, 40);
  doc.font('head').fontSize(10).fillColor(det.checklist.documented ? '#2E7D4F' : C.orange)
    .text(det.checklist.documented ? 'All mandatory evidence is complete and approved.' : `Documentation ${det.checklist.pct}% — the dossier is not yet complete.`, { width: 500 });

  footer(doc, 'CESANTONI LOGISTICS – SAMPLE REQUEST EVIDENCE REPORT');
  return toBuffer(doc);
}

async function photos(doc, ctx, list, tz) {
  if (!list.length) { doc.font('regular').fontSize(9).fillColor(C.grey).text('No evidence recorded for this stage.'); doc.fillColor(C.ink); return; }
  const x0 = doc.page.margins.left; const w = doc.page.width - x0 - doc.page.margins.right;
  const colW = (w - 16) / 2; const imgH = 170;
  let col = 0; let rowY = doc.y; let rowH = 0;
  for (const e of list) {
    const file = e.fileId && ctx.store.data.files[e.fileId];
    const isImg = file && /^image\/(jpeg|png)$/.test(file.mime);
    const boxH = (isImg ? imgH : 34) + 30;
    if (col === 0) { ensureSpace(doc, imgH + 30); rowY = doc.y; rowH = 0; }
    rowH = Math.max(rowH, boxH);
    const x = x0 + col * (colW + 16);
    if (isImg) {
      try {
        doc.image(await (await ctx.store.fileBlob(file.id)).arrayBuffer(), x, rowY, { fit: [colW, imgH], align: 'center', valign: 'center' });
        doc.rect(x, rowY, colW, imgH).lineWidth(0.5).strokeColor(C.line).stroke();
      } catch { doc.font('regular').fontSize(8).text('Image could not be rendered', x, rowY); }
    } else {
      doc.rect(x, rowY, colW, 34).fill(C.soft);
      const label = e.type === 'QUANTITY_CONFIRMATION' ? `Quantities confirmed: ${(e.data?.lines || []).map((l) => `line ${l.line}: ${l.qty} pcs`).join(', ')}` : `PDF attachment: ${file ? file.name : '—'}`;
      doc.font('regular').fontSize(8).fillColor(C.ink).text(label, x + 6, rowY + 6, { width: colW - 12, height: 26 });
    }
    const capY = rowY + (isImg ? imgH : 34) + 4;
    doc.font('head').fontSize(7.5).fillColor(C.dark).text(`${EVIDENCE_LABEL[e.type]} · ${e.state}`, x, capY, { width: colW, lineBreak: false, ellipsis: true });
    doc.font('regular').fontSize(7).fillColor(C.grey).text(`${fmtLocal(e.uploadedAt, tz)} · ${e.area === 'BODEGA' ? 'Warehouse' : e.area}${e.notes ? ' · ' + e.notes : ''}`, x, capY + 10, { width: colW, lineBreak: false, ellipsis: true });
    if (col === 1) { doc.y = rowY + rowH; doc.x = x0; }
    col = col === 0 ? 1 : 0;
  }
  if (col === 1) { doc.y = rowY + rowH; doc.x = x0; }
  doc.fillColor(C.ink);
}

export { buildDossier };
