// =====================================================================
//  UTILS / NOISE
// =====================================================================
let SEED = 1;
function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(SEED, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash3(xi, zi, s), b = hash3(xi + 1, zi, s), c = hash3(xi, zi + 1, s), d = hash3(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const moveTo = (v, t, d) => Math.abs(t - v) <= d ? t : v + Math.sign(t - v) * d;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ckey = (a, b) => (a + 32768) * 65536 + (b + 32768);

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- event bus (core → mods: every bus event is mirrored into Mods.emit)
class EventBus {
  constructor() { this.h = new Map(); }
  on(ev, fn) { if (!this.h.has(ev)) this.h.set(ev, []); this.h.get(ev).push(fn); return fn; }
  emit(ev, data) { const l = this.h.get(ev); if (l) for (const f of l) { try { f(data); } catch (e) { console.error(ev, e); } } const a = this.h.get('*'); if (a) for (const f of a) f(ev, data); }
}
const bus = new EventBus();
