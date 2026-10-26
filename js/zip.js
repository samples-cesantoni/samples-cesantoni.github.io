// Minimal ZIP reader for evidence bundles (stored and deflate entries, no ZIP64).
// Uses the browser's own DecompressionStream; nothing leaves the device.
const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

export async function readZip(file) {
  const buf = await file.arrayBuffer();
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (u32(v, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP');
  const count = u16(v, eocd + 10);
  let p = u32(v, eocd + 16);
  const utf8 = new TextDecoder('utf-8');
  const out = [];
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) throw new Error('ZIP');
    const method = u16(v, p + 10), size = u32(v, p + 20), nameLen = u16(v, p + 28), extraLen = u16(v, p + 30), commentLen = u16(v, p + 32), local = u32(v, p + 42);
    const path = utf8.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const base = path.split('/').pop();
    if (!base || path.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(path)) continue;
    const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
    const raw = new Blob([new Uint8Array(buf, start, size)]);
    let blob;
    if (method === 0) blob = raw;
    else if (method === 8) blob = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    else continue;
    out.push({ path, name: base, blob });
  }
  return out;
}
