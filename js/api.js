// Same interface as the server version, but every call is answered by js/backend.js (Firebase).
import * as backend from './backend.js';

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, { method = 'GET', body, form } = {}) {
  try {
    const out = await backend.handle(method, path, { body: body ? JSON.parse(JSON.stringify(body)) : undefined, form });
    return out && typeof out === 'object' && !(out.blob instanceof Blob) ? JSON.parse(JSON.stringify(out)) : out;
  } catch (e) {
    if (e.status === 401) onUnauthorized();
    throw new ApiError(e.status || 500, e.code || 'SERVER_ERROR', e.message, e.details);
  }
}
export const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v !== null && v !== undefined) p.set(k, v); const s = p.toString(); return s ? `?${s}` : ''; };

// Generated files (PDF, Excel, CSV) are built in the browser and saved directly.
export async function download(path, fallbackName) {
  const out = await api(path);
  saveBlob(out.blob, out.name || fallbackName);
}
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Private files (evidence, invoices) are read from Firestore and shown through blob: URLs.
const urls = new Map();
export async function fileUrl(id) {
  if (!urls.has(id)) urls.set(id, backend.fileBlob(id).then((b) => URL.createObjectURL(b)));
  return urls.get(id);
}
// Any <img data-file="FIL-…"> added to the page gets its private image loaded automatically.
const hydrate = (root) => root.querySelectorAll?.('img[data-file]:not([src])').forEach((img) => fileUrl(img.dataset.file).then((u) => { img.src = u; }).catch(() => { img.alt = 'Not available'; }));
new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && (n.matches?.('img[data-file]') ? hydrate(n.parentNode) : hydrate(n))))).observe(document.documentElement, { childList: true, subtree: true });
