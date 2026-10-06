// =====================================================================
//  MOD API — registries, hooks, filters, services, load order, conflicts
//  Mods are plain .js files:  Backrooms.mod({ id, name, version, init(api) {...} })
// =====================================================================
const salvaged = new Set();
const semver = v => String(v || '0').split(/[.\-+]/).map(x => parseInt(x) || 0);
const vcmp = (a, b) => { const A = semver(a), B = semver(b); for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); } return 0; };
function vsat(v, range) {
  if (!range || range === '*') return true;
  const m = String(range).trim().match(/^(>=|<=|>|<|=|\^|~)?\s*(.+)$/); const op = m[1] || '>=', r = m[2], c = vcmp(v, r), A = semver(v), B = semver(r);
  return op === '>=' ? c >= 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : op === '<' ? c < 0 : op === '=' ? c === 0 : op === '^' ? A[0] === B[0] && c >= 0 : A[0] === B[0] && A[1] === B[1] && c >= 0;
}
const parseDep = d => typeof d === 'string' ? (([id, r]) => ({ id, range: r || '*' }))(d.split('@')) : d;
class Registry {
  constructor(name, hooks = {}) { this.name = name; this.map = new Map(); this.patches = new Map(); this.onAdd = hooks.onAdd; this.onRemove = hooks.onRemove; this._sorted = null; }
  register(id, def, opt = {}) {
    if (typeof id === 'object') { opt = def || {}; def = id; id = def.id; }
    if (!id) throw new Error(`[${this.name}] register: нужен id`);
    const mod = opt.mod || Mods.current || 'core', prio = opt.priority ?? Mods.prio(mod), ex = this.map.get(id);
    if (ex && ex.mod !== mod) {
      if (ex.lock || ex.priority > prio) { Mods.conflict(this.name, id, ex.mod, mod); return ex.def; }
      Mods.conflict(this.name, id, mod, ex.mod);
    }
    if (ex) this.onRemove?.(id, ex.def);
    def.id = id; Object.defineProperty(def, '_mod', { value: mod, enumerable: false, configurable: true, writable: true });
    const e = { id, def, mod, priority: prio, lock: !!opt.lock, prev: ex || null };
    this.map.set(id, e); this._sorted = null;
    for (const fn of this.patches.get(id) || []) { try { fn(def); } catch (err) { Mods.error(mod, err); } }
    this.onAdd?.(id, def); bus.emit('registry:add', { registry: this.name, id, def });
    return def;
  }
  patch(id, fn) { if (!this.patches.has(id)) this.patches.set(id, []); this.patches.get(id).push(fn); const e = this.map.get(id); if (e) { fn(e.def); this.onAdd?.(id, e.def); } }
  get(id) { return this.map.get(id)?.def; }
  has(id) { return this.map.has(id); }
  all() { return [...this.map.values()].map(e => e.def); }
  sorted() { return this._sorted || (this._sorted = [...this.map.values()].sort((a, b) => (b.def.priority || 0) - (a.def.priority || 0))); }
  remove(id) { const e = this.map.get(id); if (!e) return; this.map.delete(id); this._sorted = null; this.onRemove?.(id, e.def); if (e.prev && Mods.isActive(e.prev.mod)) { this.map.set(id, e.prev); this.onAdd?.(id, e.prev.def); } }
  removeByMod(mod) { for (const [id, e] of [...this.map]) if (e.mod === mod) this.remove(id); }
}
const Mods = {
  defs: [], records: [], byId: new Map(), current: null, handlers: new Map(), filters: new Map(), services: new Map(), conflicts: [], logs: [], apis: new Map(), errors: new Map(),
  disabled: new Set(JSON.parse(localStorage.getItem('backrooms.mods.disabled') || '[]')),
  R: {},
  prio(mod) { return this.byId.get(mod)?.def.priority || (mod === 'core' ? -1000 : 0); },
  isActive(mod) { return mod === 'core' || this.byId.get(mod)?.status === 'active'; },
  log(...a) { this.logs.push(a.join(' ')); if (this.logs.length > 300) this.logs.shift(); console.log('[mods]', ...a); },
  error(mod, err) { console.error(`[mod ${mod}]`, err); this.log(`ОШИБКА ${mod}: ${err?.message || err}`); const n = (this.errors.get(mod) || 0) + 1; this.errors.set(mod, n); if (n === 25) { this.log(`${mod}: слишком много ошибок, обработчики отключены`); this.unhook(mod); } },
  conflict(reg, id, winner, loser) { this.conflicts.push({ reg, id, winner, loser }); this.log(`конфликт ${reg}:${id} — оставлен ${winner}, перекрыт ${loser}`); },
  // ---- events (priority, cancellable through ev.cancel), filters
  on(name, fn, opt = {}) { const mod = opt.mod || this.current || 'core'; const l = this.handlers.get(name) || []; l.push({ fn, mod, p: opt.priority || 0 }); l.sort((a, b) => b.p - a.p); this.handlers.set(name, l); return () => this.off(name, fn); },
  off(name, fn) { const l = this.handlers.get(name); if (l) this.handlers.set(name, l.filter(h => h.fn !== fn)); },
  emit(name, data) { const l = this.handlers.get(name); if (!l) return data; for (const h of l) { try { h.fn(data); } catch (e) { this.error(h.mod, e); } if (data && data.stop) break; } return data; },
  filter(name, value, ctx) { const l = this.filters.get(name); if (!l) return value; for (const h of l) { try { const r = h.fn(value, ctx); if (r !== undefined) value = r; } catch (e) { this.error(h.mod, e); } } return value; },
  addFilter(name, fn, opt = {}) { const mod = opt.mod || this.current || 'core'; const l = this.filters.get(name) || []; l.push({ fn, mod, p: opt.priority || 0 }); l.sort((a, b) => b.p - a.p); this.filters.set(name, l); },
  unhook(mod) { for (const [k, l] of this.handlers) this.handlers.set(k, l.filter(h => h.mod !== mod)); for (const [k, l] of this.filters) this.filters.set(k, l.filter(h => h.mod !== mod)); },
  // ---- per-mod api object
  api(mod) {
    if (this.apis.has(mod)) return this.apis.get(mod);
    const self = this, R = this.R;
    const reg = r => ({ register: (id, def, o = {}) => r.register(id, def, { ...o, mod }), patch: (id, fn) => r.patch(id, fn), get: id => r.get(id), has: id => r.has(id), all: () => r.all(), remove: id => r.remove(id) });
    const api = {
      id: mod, THREE, RAPIER, version: Backrooms.version,
      items: reg(R.items), zones: reg(R.zones), structures: reg(R.structures), build: reg(R.build), events: reg(R.events), recipes: reg(R.recipes), machines: reg(R.machines),
      quests: reg(R.quests), interactions: reg(R.interactions), stats: reg(R.stats), commands: reg(R.commands), effects: reg(R.effects), sanity: reg(R.sanity), materials: { get: (k, t) => zmat(k, t), register: (k, m) => { matCache.set(k + ':' + 0xffffff, m); UVS[k] = UVS[k] || [1]; } },
      on: (n, fn, o = {}) => self.on(n, fn, { ...o, mod }), off: (n, fn) => self.off(n, fn), emit: (n, d) => { self.emit(n, d); return d; },
      filter: (n, fn, o = {}) => self.addFilter(n, fn, { ...o, mod }),
      provide: (name, v) => { if (self.services.has(name)) self.log(`сервис ${name} перекрыт модом ${mod}`); self.services.set(name, v); return v; },
      require: name => self.services.get(name), mod: id => self.byId.get(id)?.status === 'active' ? self.byId.get(id).exports : null, isLoaded: id => self.isActive(id),
      data: {}, // saved with the game save
      settings(defaults, opts = {}) { return ModSettings.make(mod, defaults, opts); },
      ui: ModUI.forMod(mod), audio, say, log: (...a) => self.log(mod + ':', ...a),
      power: { at: p => Machines.powerAt(p) }, quest: { count: (k, n) => Quests.count(k, n), done: id => Quests.done.has(id) },
      inv: { add: (id, n) => inv.add(id, n), take: (id, n) => inv.take(id, n), count: id => inv.count(id), slots: () => inv.slots, selected: () => inv.active() },
      engine: { MOVE, SFX, forceSanityFX, scene, camera, renderer, world, composer, player, inv, game, chunks, pieces, worldItems, ZONES, ITEMS, BUILD, EVENTS, WORLD, U, POWER, dir, hall, keys, spawnItem, removeItem, teleport, feetPos, camRay, setFixtureOff, fixtureAt, sampleLight, zoneAt, isPool, isPoolAt, rebuildChunk, runEvent, addPanic, applyUse, say, createPiece, toggleDoor, zmat, GB, CELL, CS, CN, pickedKeys, salvaged, deadFixtures, switchOff, BAL, WorldObj, LAYOUTS, layoutOf, floorY, featureAt, fixtureLit, roomCells, iconHtml, ICON_SVG, pickupToast, bus, Watcher },
      util: { rand, pick, clamp, lerp, damp, smooth, hash3, vnoise, mulberry, V3, moveTo },
    };
    this.apis.set(mod, api); return api;
  },
  saveData() { const o = {}; for (const [id, a] of this.apis) if (Object.keys(a.data).length) o[id] = a.data; return o; },
  loadData(o) { this.resetData(); for (const id in o) { const a = this.apis.get(id); if (a) Object.assign(a.data, o[id]); } },
  resetData() { for (const a of this.apis.values()) for (const k in a.data) delete a.data[k]; },
  // ---- structures during chunk generation
  genChunk(chunk, ctx) {
    const list = this.R.structures.sorted(); if (!list.length) return;
    const used = ctx.used || new Set(); ctx.claim = (gx, gz) => { const k = gx + ',' + gz; if (used.has(k)) return false; used.add(k); return true; };
    ctx.free = (gx, gz) => !isPool(gx, gz) && !isExitCell(gx, gz) && !(Math.abs(gx) <= 1 && Math.abs(gz) <= 1) && !used.has(gx + ',' + gz);
    for (const e of list) {
      const d = e.def, api = this.api(e.mod);
      if (d.zones && !d.zones.includes(ctx.zone.key)) continue;
      try {
        if (d.chunk) d.chunk(ctx, api);
        if (d.cell) for (let lz = 0; lz < CN; lz++) for (let lx = 0; lx < CN; lx++) {
          const gx = ctx.cx * CN + lx, gz = ctx.cz * CN + lz; if (!ctx.free(gx, gz)) continue;
          const ch = typeof d.chance === 'function' ? d.chance(ctx.zone, gx, gz) : (d.chance ?? .01);
          if (hash3(gx, gz, (d.salt || 7000) + ctx.vr) >= ch) continue;
          ctx.claim(gx, gz);
          d.cell(ctx, { gx, gz, x: gx * CELL, z: gz * CELL, mx: gx * CELL + CELL / 2, mz: gz * CELL + CELL / 2, rng: mulberry((hash3(gx, gz, 7100 + ctx.vr) * 4294967296) | 0), key: (i) => `m:${d.id}:${gx},${gz},${i},${ctx.vr}` }, api);
        }
      } catch (err) { this.error(e.mod, err); }
    }
  },
  // ---- loading
  async boot() {
    initCoreRegistries();
    const before = this.defs.length;
    await ModLoader.loadAll();
    this.resolve(); this.initAll();
    this.log(`модов активно: ${this.records.filter(r => r.status === 'active').length} (встроенных ${before})`);
  },
  resolve() {
    const best = new Map();
    for (const c of this.defs) {
      const d = c.def; if (!d || !d.id) { this.log('мод без id пропущен (' + c.source + ')'); continue; }
      const ex = best.get(d.id);
      if (!ex) best.set(d.id, c);
      else { const keep = vcmp(d.version, ex.def.version) > 0 ? c : ex; this.log(`дубликат ${d.id}: ${ex.def.version}/${ex.source} vs ${d.version}/${c.source} → ${keep.def.version}`); best.set(d.id, keep); }
    }
    const recs = [...best.values()].map(c => ({ id: c.def.id, def: c.def, source: c.source, status: this.disabled.has(c.def.id) && !c.def.required ? 'disabled' : 'active', reason: '', exports: null }));
    const map = new Map(recs.map(r => [r.id, r])); this.byId = map;
    const act = id => map.get(id)?.status === 'active';
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of recs) {
        if (r.status !== 'active') continue;
        for (const d of (r.def.requires || r.def.dependencies || []).map(parseDep)) {
          const t = map.get(d.id);
          if (!t || t.status !== 'active' || !vsat(t.def.version, d.range)) { r.status = 'error'; r.reason = `нужен ${d.id} ${d.range}` + (t ? ` (есть ${t.def.version}, ${t.status})` : ' (не найден)'); changed = true; break; }
        }
        if (r.status !== 'active') continue;
        for (const cid of r.def.conflicts || []) {
          const o = map.get(cid); if (!o || o.status !== 'active') continue;
          const loser = (o.def.priority || 0) > (r.def.priority || 0) ? r : (o.def.priority || 0) < (r.def.priority || 0) ? o : (r.id > o.id ? r : o);
          loser.status = 'conflict'; loser.reason = `несовместим с ${loser === r ? o.id : r.id}`; this.log(`конфликт модов: ${r.id} ⟂ ${o.id} → отключён ${loser.id}`); changed = true;
        }
      }
    }
    // topological order: requires / loadAfter / loadBefore, ties → priority desc, id
    const live = recs.filter(r => r.status === 'active'), edges = new Map(live.map(r => [r.id, new Set()])), indeg = new Map(live.map(r => [r.id, 0]));
    const edge = (a, b) => { if (!edges.has(a) || !edges.has(b) || a === b || edges.get(a).has(b)) return; edges.get(a).add(b); indeg.set(b, indeg.get(b) + 1); };
    for (const r of live) {
      for (const d of (r.def.requires || r.def.dependencies || []).map(parseDep)) edge(d.id, r.id);
      for (const a of r.def.loadAfter || []) edge(a, r.id);
      for (const b of r.def.loadBefore || []) edge(r.id, b);
    }
    const order = [], cmp = (a, b) => ((map.get(b).def.builtin ? 1 : 0) - (map.get(a).def.builtin ? 1 : 0)) || ((map.get(b).def.priority || 0) - (map.get(a).def.priority || 0)) || (a < b ? -1 : 1);
    let ready = live.filter(r => !indeg.get(r.id)).map(r => r.id).sort(cmp);
    while (ready.length) { const id = ready.shift(); order.push(id); for (const b of edges.get(id)) { indeg.set(b, indeg.get(b) - 1); if (!indeg.get(b)) { ready.push(b); ready.sort(cmp); } } }
    if (order.length < live.length) { const rest = live.map(r => r.id).filter(id => !order.includes(id)).sort(cmp); this.log('цикл в порядке загрузки: ' + rest.join(', ')); order.push(...rest); }
    this.records = [...order.map(id => map.get(id)), ...recs.filter(r => r.status !== 'active')];
  },
  initAll() {
    const active = this.records.filter(r => r.status === 'active');
    for (const r of active) {
      this.current = r.id; const api = this.api(r.id);
      try { r.exports = r.def.init ? (r.def.init(api) || {}) : {}; if (r.def.exports) Object.assign(r.exports, r.def.exports); }
      catch (e) { this.error(r.id, e); r.status = 'error'; r.reason = String(e?.message || e); for (const reg of Object.values(this.R)) reg.removeByMod(r.id); this.unhook(r.id); }
    }
    for (const r of active) if (r.status === 'active' && r.def.postInit) { this.current = r.id; try { r.def.postInit(this.api(r.id)); } catch (e) { this.error(r.id, e); } }
    this.current = null;
  },
  setEnabled(id, on) { on ? this.disabled.delete(id) : this.disabled.add(id); localStorage.setItem('backrooms.mods.disabled', JSON.stringify([...this.disabled])); },
};
const Backrooms = window.Backrooms = {
  version: '4.0', _src: 'builtin',
  mod(def) { Mods.defs.push({ def, source: Backrooms._src }); return def; },
  get api() { return Mods; },
};
Backrooms.register = Backrooms.mod;

// ---------------- loader: Mods/mods.js list, http listing, chosen folder (File System Access), installed library (IndexedDB)
const IDB = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('backrooms', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('mods'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async op(store, mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction(store, mode), st = tx.objectStore(store), q = fn(st); tx.oncomplete = () => res(q?.result); tx.onerror = () => rej(tx.error); }); },
  get: (s, k) => IDB.op(s, 'readonly', st => st.get(k)), set: (s, k, v) => IDB.op(s, 'readwrite', st => st.put(v, k)), del: (s, k) => IDB.op(s, 'readwrite', st => st.delete(k)),
  all: (s) => IDB.op(s, 'readonly', st => st.getAll()), keys: (s) => IDB.op(s, 'readonly', st => st.getAllKeys()),
};
const ModLoader = {
  folder: null, folderState: 'none', sources: [],
  script(src, label) {
    return new Promise(res => {
      const el = document.createElement('script'); el.src = src; el.async = false;
      const t = setTimeout(() => res(false), 8000);
      el.onload = () => { clearTimeout(t); res(true); }; el.onerror = () => { clearTimeout(t); res(false); };
      Backrooms._src = label; document.head.appendChild(el);
    });
  },
  async code(text, label) { const url = URL.createObjectURL(new Blob([text + `\n//# sourceURL=mod:${label}`], { type: 'text/javascript' })); const ok = await this.script(url, label); URL.revokeObjectURL(url); return ok; },
  async loadAll() {
    const seen = new Set(), add = (n, s) => { this.sources.push({ name: n, source: s }); };
    // 1) Mods/mods.js — optional list:  window.BACKROOMS_MODS = ['a.js', 'b.js']
    await this.script('Mods/mods.js', 'Mods/mods.js');
    for (const f of (window.BACKROOMS_MODS || [])) { if (seen.has(f)) continue; seen.add(f); if (await this.script('Mods/' + f, 'Mods/' + f)) add(f, 'Mods/'); }
    // 2) served over http: parse the directory listing
    if (location.protocol.startsWith('http')) {
      try { const r = await fetch('Mods/'); if (r.ok) { const html = await r.text(); for (const m of html.matchAll(/href="([^"?#]+\.js)"/g)) { const f = decodeURIComponent(m[1].split('/').pop()); if (seen.has(f) || f === 'mods.js') continue; seen.add(f); if (await this.script('Mods/' + f, 'Mods/' + f)) add(f, 'http'); } } } catch (e) {}
    }
    // 3) folder picked by the user (persisted handle)
    try {
      const h = await IDB.get('kv', 'modsFolder');
      if (h) { this.folder = h; const p = await h.queryPermission({ mode: 'read' }); this.folderState = p;
        if (p === 'granted') for await (const [name, fh] of h.entries()) { if (fh.kind !== 'file' || !name.endsWith('.js') || name === 'mods.js' || seen.has(name)) continue; seen.add(name); const txt = await (await fh.getFile()).text(); if (await this.code(txt, 'папка/' + name)) add(name, 'папка'); } }
    } catch (e) { console.warn(e); }
    // 4) installed library
    try { const keys = await IDB.keys('mods'); for (const k of keys) { if (seen.has(k)) continue; seen.add(k); const txt = await IDB.get('mods', k); if (await this.code(txt, 'библиотека/' + k)) add(k, 'библиотека'); } } catch (e) { console.warn(e); }
    Backrooms._src = 'runtime';
  },
  async pickFolder() {
    try { const h = await showDirectoryPicker({ mode: 'read', id: 'backrooms-mods' }); await IDB.set('kv', 'modsFolder', h); location.reload(); } catch (e) {}
  },
  async grantFolder() { if (!this.folder) return; try { if (await this.folder.requestPermission({ mode: 'read' }) === 'granted') location.reload(); } catch (e) {} },
  async forgetFolder() { await IDB.del('kv', 'modsFolder'); location.reload(); },
  async install(files) { for (const f of files) if (f.name.endsWith('.js')) await IDB.set('mods', f.name, await f.text()); location.reload(); },
  async uninstall(name) { await IDB.del('mods', name); location.reload(); },
};

// ---------------- per-mod settings (persisted, shown in the settings pane)
const ModSettings = {
  folder: null,
  make(mod, defaults, opts) {
    const key = 'backrooms.mod.' + mod; let o = { ...defaults };
    try { Object.assign(o, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) {}
    if (!this.folder) this.folder = pane.addFolder({ title: 'Моды', expanded: false });
    const f = this.folder.addFolder({ title: opts.title || Mods.byId.get(mod)?.def.name || mod, expanded: false });
    for (const k in defaults) { const sc = (opts.schema || {})[k] || {}; try { f.addBinding(o, k, { label: sc.label || k, ...sc }).on('change', () => { localStorage.setItem(key, JSON.stringify(o)); opts.onChange?.(k, o[k]); }); } catch (e) {} }
    return o;
  },
};
// ---------------- UI helpers for mods
const ModUI = {
  objectives: [],
  forMod(mod) {
    return {
      hud(id, html = '') { let el = document.getElementById('modhud-' + id); if (!el) { el = document.createElement('div'); el.id = 'modhud-' + id; el.className = 'modhud-el'; $('modhud').appendChild(el); } if (html !== null) el.innerHTML = html; return el; },
      objective(fn) { ModUI.objectives.push({ fn, mod }); },
      menuButton(label, fn) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('modbtns').appendChild(b); return b; },
      panel(title, html, buttons = [['ЗАКРЫТЬ', () => closeDialog()]]) { openDialog(title, html, buttons.map(([l, f]) => [l, () => f(closeDialog)])); },
      close: () => closeDialog(),
      notify: (t, s) => say(t, s), style(css) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); return st; },
      el: id => $(id),
    };
  },
};
// ---------------- stats added by mods (extra survival bars)
const ModStats = {
  reset() { for (const d of Mods.R.stats.all()) player.st[d.id] = d.initial ?? d.max ?? 100; },
  update(dt) { for (const e of Mods.R.stats.sorted()) { const d = e.def; if (player.st[d.id] === undefined) player.st[d.id] = d.initial ?? 100; if (d.tick) try { d.tick(dt, player.st, Mods.api(e.mod)); } catch (err) { Mods.error(e.mod, err); } player.st[d.id] = clamp(player.st[d.id], 0, d.max ?? 100); } },
  render() {
    const box = $('modstats'); if (!box) return;
    for (const d of Mods.R.stats.all()) {
      const show = typeof d.show === 'function' ? d.show(player.st) : d.show !== false; let row = document.getElementById('ms_' + d.id);
      if (!row) { row = document.createElement('div'); row.className = 'row'; row.id = 'ms_' + d.id; row.innerHTML = `<span>${d.label || d.id}</span><div class="bar"><i style="${d.color ? 'background:' + d.color : ''}"></i></div>`; box.appendChild(row); }
      row.style.display = show ? 'flex' : 'none'; const v = (player.st[d.id] ?? 0) / (d.max ?? 100); row.querySelector('i').style.width = (v * 100).toFixed(1) + '%'; row.classList.toggle('low', v * 100 < (d.low ?? 25));
    }
  },
};
// ---------------- interactions, recipes, machines, quests, commands, effects
const Interactions = { sorted: () => Mods.R.interactions.sorted() };
const Recipes = {
  stationNear(st) { if (!st) return true; const fp = feetPos(); for (const pc of pieces) if ((pc.def.station === st || pc.def.id === st) && pc.pos.distanceTo(fp) < 3.6) return true; return false; },
  can(r) { return Object.entries(r.in).every(([k, n]) => inv.count(k) >= n) && this.stationNear(r.station); },
  craft(r) {
    if (!this.can(r)) { audio.click(); return false; }
    for (const [k, n] of Object.entries(r.in)) inv.take(k, n);
    for (const [k, n] of Object.entries(r.out)) { const left = inv.add(k, n); for (let i = 0; i < left; i++) spawnItem(k, feetPos().add(V3(0, 1, 0))); }
    audio.crack(null); audio.pickup(); Quests.count('craft'); if (r.station) Quests.count('craft:' + r.station); Mods.emit('craft', { recipe: r }); return true;
  },
};
const Machines = {
  list: new Set(),
  attach(piece, state) {
    const def = Mods.R.machines.get(piece.def.machine); if (!def) return;
    const m = { def, piece, pos: piece.pos, state: state ? { ...state } : { ...(def.state || {}) }, t: 0 };
    piece.machine = m; this.list.add(m); try { def.init?.(m, Mods.api(def._mod)); } catch (e) { Mods.error(def._mod, e); }
  },
  detach(piece) { const m = piece.machine; if (!m) return; try { m.def.remove?.(m, Mods.api(m.def._mod)); } catch (e) {} this.list.delete(m); },
  update(dt) { for (const m of this.list) { m.t += dt; try { m.def.tick?.(m, dt, Mods.api(m.def._mod)); } catch (e) { Mods.error(m.def._mod, e); } } },
  powerAt(p) { let w = 0; for (const m of this.list) if (m.def.power && m.def.producing?.(m) && m.pos.distanceTo(p) < (m.def.range || 14)) w += m.def.power; return w; },
  prompt(pc) { const m = pc.machine, d = m.def; const text = d.prompt ? d.prompt(m, Mods.api(d._mod)) : `E — ${d.name}`; if (!text) return null; return { text, run: () => { try { d.interact?.(m, Mods.api(d._mod)); } catch (e) { Mods.error(d._mod, e); } } }; },
};
const Quests = {
  done: new Set(), counters: {}, t: 0, shown: [],
  reset() { this.done.clear(); this.counters = {}; },
  count(k, n = 1) { this.counters[k] = (this.counters[k] || 0) + n; },
  get: k => Quests.counters[k] || 0,
  available() { return Mods.R.quests.all().filter(q => !this.done.has(q.id) && (q.after || []).every(a => this.done.has(a) || !Mods.R.quests.has(a))).sort((a, b) => (a.order ?? 100) - (b.order ?? 100)); },
  progress(q) { try { const r = q.check(Mods.api(q._mod), this); if (r === true) return 1; if (typeof r === 'number') return r; if (r && r.of) return { ...r, k: r.n / r.of }; return 0; } catch (e) { Mods.error(q._mod, e); return 0; } },
  update(dt) {
    ModStats.update(dt);
    if ((this.t -= dt) > 0) return; this.t = .5;
    for (const q of this.available()) {
      const p = this.progress(q), k = typeof p === 'number' ? p : p.k;
      if (k >= 1) {
        this.done.add(q.id); audio.pickup(); say(`✔ Задание выполнено: ${q.title}`, 5);
        for (const [id, n] of Object.entries(q.reward || {})) { if (!ITEMS[id]) continue; const left = inv.add(id, n); for (let i = 0; i < left; i++) spawnItem(id, feetPos().add(V3(0, 1, 0))); say(`Награда: ${ITEMS[id].icon} ${ITEMS[id].name} ×${n}`, 4); }
        try { q.onDone?.(Mods.api(q._mod)); } catch (e) { Mods.error(q._mod, e); }
        Mods.emit('quest:done', q);
      }
    }
  },
  objectiveLines(out) {
    for (const q of this.available().slice(0, 2)) { const p = this.progress(q); out.push(`<span class="q">◆ ${q.title}</span> <span class="d">— ${q.desc}${p && p.of ? ` (${p.n}/${p.of})` : ''}</span>`); }
    for (const o of ModUI.objectives) { try { const r = o.fn(); if (r) out.push(...[].concat(r)); } catch (e) { Mods.error(o.mod, e); } }
  },
  html() { return Mods.R.quests.all().sort((a, b) => (a.order ?? 100) - (b.order ?? 100)).map(q => `<div class="${this.done.has(q.id) ? 'qd' : ''}">${this.done.has(q.id) ? '✔' : '◆'} <b>${q.title}</b> — ${q.desc}${q.reward ? ` <span class="d">[награда: ${Object.entries(q.reward).map(([k, n]) => (ITEMS[k]?.icon || k) + n).join(' ')}]</span>` : ''}</div>`).join(''); },
  save() { return { done: [...this.done], counters: this.counters }; },
  load(d) { this.reset(); if (!d) return; for (const id of d.done || []) this.done.add(id); this.counters = d.counters || {}; },
};
const DevConsole = {
  toggle() {
    const c = $('console'); const on = c.classList.contains('hidden');
    if (on) { c.classList.remove('hidden'); game.state = 'console'; document.exitPointerLock?.(); keysClear(); setTimeout(() => $('conin').focus(), 0); this.print('Команды: help'); }
    else { c.classList.add('hidden'); resume(); }
  },
  print(t) { const o = $('conout'); o.textContent += t + '\n'; o.scrollTop = 1e9; },
  run(line) {
    const [name, ...args] = line.trim().split(/\s+/); if (!name) return; this.print('> ' + line);
    const c = Mods.R.commands.get(name); if (!c) { this.print('нет такой команды'); return; }
    try { const r = c.run(args, Mods.api(c._mod)); if (r !== undefined) this.print(String(r)); } catch (e) { this.print('ошибка: ' + e.message); }
  },
};
const effectPasses = new Map();
function initCoreRegistries() {
  const R = Mods.R;
  R.items = new Registry('items', {
    onAdd(id, d) { d.name ??= id; d.icon ??= '📦'; d.stack ??= 10; d.desc ??= ''; d.mesh ??= ['box', [.14, .1, .14], 0x8a8a80]; ITEMS[id] = d; if (d.loot) LOOT_BASE[id] = d.loot; for (const z in d.lootZones || {}) (LOOT_MOD[z] ||= {})[id] = d.lootZones[z]; },
    onRemove(id) { delete ITEMS[id]; delete LOOT_BASE[id]; },
  });
  R.zones = new Registry('zones', {
    onAdd(id, d) { const lay = d.layout ?? (d.wallP !== undefined ? 'noise' : undefined); Object.assign(d, { ...ZONES.lobby, reverb: .4, ...d, key: id }); if (lay) d.layout = lay; ZONES[id] = d; const i = ZONE_W.findIndex(w => w[0] === id); if (d.weight !== undefined) { if (i >= 0) ZONE_W[i][1] = d.weight; else ZONE_W.push([id, d.weight]); } },
    onRemove(id) { delete ZONES[id]; const i = ZONE_W.findIndex(w => w[0] === id); if (i >= 0) ZONE_W.splice(i, 1); },
  });
  R.build = new Registry('build', {
    onAdd(id, d) { d.name ??= id; d.cost ??= {}; d.snap ??= .25; if (d.boxes && !d.parts) { const bx = d.boxes; d.parts = () => bx; } const i = BUILD.findIndex(b => b.id === id); if (i >= 0) BUILD[i] = d; else BUILD.push(d); BUILD_BY_ID[id] = d; },
    onRemove(id) { const i = BUILD.findIndex(b => b.id === id); if (i >= 0) BUILD.splice(i, 1); delete BUILD_BY_ID[id]; },
  });
  R.events = new Registry('events', { onAdd(id, d) { if (typeof d.w !== 'function') { const w = d.weight ?? d.w ?? 1; d.w = () => w; } EVENTS[id] = d; }, onRemove(id) { delete EVENTS[id]; } });
  R.structures = new Registry('structures');
  R.recipes = new Registry('recipes', { onAdd(id, d) { d.in ??= {}; d.out ??= {}; d.name ??= ITEMS[Object.keys(d.out)[0]]?.name || id; } });
  R.machines = new Registry('machines', { onAdd(id, d) { if (d.build) R.build.register(id, { name: d.name, ...d.build, machine: id }, { mod: d._mod }); } });
  R.quests = new Registry('quests');
  R.interactions = new Registry('interactions');
  R.stats = new Registry('stats', { onAdd(id, d) { if (player.st[id] === undefined) player.st[id] = d.initial ?? d.max ?? 100; } });
  R.commands = new Registry('commands');
  R.effects = new Registry('effects', {
    onAdd(id, d) {
      const pass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, ...(d.uniforms || {}) }, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`, fragmentShader: d.fragment });
      composer.insertPass(pass, composer.passes.indexOf(atmos)); effectPasses.set(id, { pass, d });
    },
    onRemove(id) { const e = effectPasses.get(id); if (e) { composer.removePass(e.pass); effectPasses.delete(id); } },
  });
  // existing core content becomes registry entries (so mods can patch / override them)
  Mods.current = 'core';
  for (const id of Object.keys(ITEMS)) R.items.register(id, ITEMS[id], { mod: 'core', priority: -1000 });
  for (const id of Object.keys(ZONES)) { const w = ZONE_W.find(x => x[0] === id); R.zones.register(id, ZONES[id], { mod: 'core', priority: -1000 }); }
  for (const b of [...BUILD]) R.build.register(b.id, b, { mod: 'core', priority: -1000 });
  for (const id of Object.keys(EVENTS)) R.events.register(id, EVENTS[id], { mod: 'core', priority: -1000 });
  R.sanity = R.sanity || new Registry('sanity');
  for (const e of SANITY_FX) R.sanity.register(e.id, e, { mod: 'core', priority: -1000 });
  Mods.current = null;
  bus.on('*', (ev, data) => Mods.emit(ev, data));
  Mods.on('update', dt => { for (const { pass, d } of effectPasses.values()) { pass.enabled = d.enabled ? !!d.enabled() : true; pass.uniforms.uTime.value += dt; pass.uniforms.uRes.value.copy(atmos.uniforms.uRes.value); try { d.update?.(pass.uniforms, dt); } catch (e) { Mods.error(d._mod, e); } } }, { mod: 'core' });
  // core console commands
  const C = (name, help, run) => R.commands.register(name, { help, run }, { mod: 'core' });
  C('help', 'список команд', () => R.commands.all().map(c => `${c.id} — ${c.help || ''}`).join('\n'));
  C('give', 'give <item> [n]', ([id, n]) => ITEMS[id] ? (inv.add(id, +n || 1), 'ok') : 'предметы: ' + Object.keys(ITEMS).join(', '));
  C('tp', 'tp <x> <z>', ([x, z]) => { prebuild(+x, +z); teleport(+x, 0, +z); return 'ok'; });
  C('event', 'event <name>', ([n]) => n ? String(runEvent(n)) : Object.keys(EVENTS).join(', '));
  C('heal', 'восстановить все показатели', () => { Object.assign(player.st, { health: 100, hunger: 100, thirst: 100, energy: 100, sanity: 100, panic: 0 }); return 'ok'; });
  C('mods', 'список модов', () => Mods.records.map(r => `${r.id}@${r.def.version || '?'} [${r.status}] ${r.reason || ''} (${r.source})`).join('\n'));
  C('exit', 'показать координаты выхода', () => `${WORLD.exitX}, ${WORLD.exitZ}`);
  C('sfx', 'sfx <id> — вызвать эффект безумия', ([id]) => id ? String(forceSanityFX(id) ?? 'ok') : R.sanity.all().map(e => e.id).join(', '));
  C('sanity', 'sanity <0-100>', ([n]) => { player.st.sanity = Math.max(0, Math.min(100, +n || 0)); return 'ok'; });
  C('quests', 'состояние заданий', () => Quests.available().map(q => q.id).join(', ') + ' | выполнено: ' + [...Quests.done].join(', '));
}
// ---------------- mod manager dialog
function openModManager() {
  const rows = Mods.records.map(r => {
    const st = { active: '<span style="color:#9fe8a0">активен</span>', disabled: '<span style="color:#9c9374">выключен</span>', error: '<span style="color:#e88a7a">ошибка</span>', conflict: '<span style="color:#e8b07a">конфликт</span>' }[r.status];
    const tog = r.def.required ? '' : `<label style="float:right;cursor:pointer"><input type="checkbox" data-mod="${r.id}" ${Mods.disabled.has(r.id) ? '' : 'checked'}> вкл</label>`;
    const del = r.source.startsWith('библиотека/') ? ` <a href="#" data-del="${r.source.slice(11)}" style="color:#e88a7a">удалить</a>` : '';
    return `<div class="note">${tog}<b>${r.def.name || r.id}</b> <span class="d">${r.id}@${r.def.version || '?'} · ${r.source}</span>${del}<div>${st}${r.reason ? ' — ' + r.reason : ''}${r.def.description ? '<br>' + r.def.description : ''}</div></div>`;
  }).join('');
  const conf = Mods.conflicts.length ? `<p class="d">Перекрытия контента (решены автоматически): ${Mods.conflicts.slice(-12).map(c => `${c.reg}:${c.id} → ${c.winner}`).join(', ')}</p>` : '';
  const fs = 'showDirectoryPicker' in window;
  const folder = ModLoader.folder ? `Папка модов: <b>${ModLoader.folder.name}</b> (${ModLoader.folderState === 'granted' ? 'подключена' : 'нужно разрешение'})` : 'Папка модов не выбрана.';
  openDialog('МОДЫ', `<p class="d">Мод — это .js-файл в папке <b>Mods</b> рядом с игрой. ${folder}</p>${rows}${conf}<p class="d">Изменения применяются после перезагрузки.</p>`, [
    ...(fs ? [[ModLoader.folder ? 'СМЕНИТЬ ПАПКУ' : 'ВЫБРАТЬ ПАПКУ MODS', () => ModLoader.pickFolder()]] : []),
    ...(ModLoader.folder && ModLoader.folderState !== 'granted' ? [['РАЗРЕШИТЬ ДОСТУП', () => ModLoader.grantFolder()]] : []),
    ['УСТАНОВИТЬ .JS', () => $('modfile').click()], ['ПЕРЕЗАГРУЗИТЬ', () => location.reload()], ['ЗАКРЫТЬ', () => { closeDialog(); if (!game.started) { game.state = 'menu'; $('menu').classList.remove('hidden'); } }],
  ], false);
  $('dtext').querySelectorAll('input[data-mod]').forEach(cb => cb.onchange = () => Mods.setEnabled(cb.dataset.mod, cb.checked));
  $('dtext').querySelectorAll('a[data-del]').forEach(a => a.onclick = e => { e.preventDefault(); ModLoader.uninstall(a.dataset.del); });
}
// ---------------- crafting panel (inside inventory)
function renderCraft() {
  const el = $('craft'); if (!el) return;
  const list = Mods.R.recipes.all();
  el.innerHTML = '<h2>КРАФТ</h2>' + (list.length ? list.map((r, i) => {
    const ok = Recipes.can(r), st = r.station ? Recipes.stationNear(r.station) : true;
    const ins = Object.entries(r.in).map(([k, n]) => `<span style="color:${inv.count(k) >= n ? '#e9dfb8' : '#8a7e62'}">${ITEMS[k] ? iconHtml(k, 'ico sm') : k}${n}</span>`).join(' ');
    const outs = Object.entries(r.out).map(([k, n]) => `${ITEMS[k] ? iconHtml(k, 'ico md') : k}${n > 1 ? '×' + n : ''}`).join(' ');
    return `<div class="rc ${ok ? 'ok' : ''}" data-r="${r.id}" title="${esc(ITEMS[Object.keys(r.out)[0]]?.desc || '')}"><div class="rc-o">${outs}</div><div><b>${r.name}</b><br><span class="d">${ins}${r.station ? ` · <span style="color:${st ? '#9fe8a0' : '#e88a7a'}">${BUILD_BY_ID[r.station]?.name || r.station}</span>` : ''}</span></div></div>`;
  }).join('') : '<p class="d">Рецептов нет.</p>');
  el.querySelectorAll('.rc').forEach(d => d.onclick = () => { if (Recipes.craft(Mods.R.recipes.get(d.dataset.r))) { renderInv(); renderCraft(); } });
}


