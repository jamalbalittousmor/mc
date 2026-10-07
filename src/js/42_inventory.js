// =====================================================================
//  INVENTORY
// =====================================================================
// 6 ячеек быстрого доступа + 30 рюкзака; самодельный рюкзак (крафт) даёт ещё 10
const INV_HOTBAR = 6, INV_BASE = 36, INV_BAG = 10;
const inv = {
  slots: new Array(INV_BASE).fill(null), sel: 0, bag: 0,
  capacity() { return INV_BASE + this.bag * INV_BAG; },
  // привести длину к вместимости; лишнее (если рюкзак сняли) — выпадает на пол
  fit() { const n = this.capacity(); while (this.slots.length < n) this.slots.push(null); while (this.slots.length > n) { const s = this.slots.pop(); if (s) dropStack(s.id, s.n); } },
  setBag(n) { this.bag = n; this.fit(); bus.emit('inventory:changed'); },
  free() { return this.slots.reduce((a, s) => a + (s ? 0 : 1), 0); },
  add(id, n = 1) {
    const st = ITEMS[id].stack;
    for (const s of this.slots) if (s && s.id === id && s.n < st && n > 0) { const k = Math.min(n, st - s.n); s.n += k; n -= k; }
    for (let i = 0; i < this.slots.length && n > 0; i++) if (!this.slots[i]) { const k = Math.min(n, st); this.slots[i] = { id, n: k }; n -= k; }
    bus.emit('inventory:changed'); return n;
  },
  count(id) { return this.slots.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); },
  take(id, n = 1) {
    if (this.count(id) < n) return false;
    for (let i = this.slots.length - 1; i >= 0 && n > 0; i--) { const s = this.slots[i]; if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) this.slots[i] = null; } }
    bus.emit('inventory:changed'); return true;
  },
  takeSlot(i, n = 1) { const s = this.slots[i]; if (!s) return null; s.n -= n; if (s.n <= 0) this.slots[i] = null; bus.emit('inventory:changed'); return s.id; },
  active() { return this.slots[this.sel]; },
};
let chalkUses = 12;
function useSlot(i) {
  const s = inv.slots[i]; if (!s) return;
  const id = s.id, def = ITEMS[id];
  const ev = { id, slot: i, cancel: false }; Mods.emit('item:use', ev); if (ev.cancel) return;
  if (def.onUse) { const r = def.onUse(Mods.api(def._mod || 'core'), { slot: i, id }); if (r) inv.takeSlot(i); return; }
  if (def.use) {
    applyUse(def.use); inv.takeSlot(i);
    if (def.sound) audio[def.sound]?.(); else if (id === 'bar' || id === 'can') audio.eat(); else if (id === 'pills') audio.pills(); else audio.gulp();
    bus.emit('player:consume', { id });
    if (def.useText) say(def.useText, 4); else say({ almond: 'Сладковатый тёплый вкус. Дышать становится легче.', water: 'Вода тёплая, но это вода.', bar: 'Шоколад. Почти как дома.', can: 'Солоно. Но сытно.', pills: 'Мысли понемногу выстраиваются в ряд.', energy: 'Сердце забилось быстрее.' }[id] || '', 4);
  } else if (id === 'battery') { player.flash.battery = 1; player.flash.on = true; inv.takeSlot(i); audio.click(); say('Фонарик снова светит ровно.', 3); }
  else if (id === 'chalk') { if (drawChalk()) { if (--chalkUses <= 0) { chalkUses = 12; inv.takeSlot(i); say('Мелок раскрошился.'); } } }
  else say('Это материал для строительства. Нажми B.', 3);
}
function camRay(maxD) {
  const o = camera.getWorldPosition(V3()), d = camera.getWorldDirection(V3());
  const hit = world.castRayAndGetNormal(new RAPIER.Ray(o, d), maxD, true, undefined, undefined, player.col);
  if (!hit) return null;
  return { point: o.clone().addScaledVector(d, hit.timeOfImpact), normal: V3(hit.normal.x, hit.normal.y, hit.normal.z), collider: hit.collider, dist: hit.timeOfImpact, dir: d };
}
// ---------------- что ВИДНО в точке попадания луча
// Физика знает только коллайдер (весь чанк — одно тело), а не материал. Для разборки стен/пола/потолка
// нужно знать, что нарисовано: обои, деревянная панель, плинтус, рама светильника, бетон…
// Пускаем луч по мешам чанков (один меш на материал) рядом с точкой физического попадания.
const VIS_SKIP = new Set(['stain', 'footprint', 'peel', 'puddle', 'water', 'waterLite', 'exit']);
const _vRay = new THREE.Raycaster(), _vMeshes = [], _vCache = new Map();
function visualRay(o, d, near, far) {
  _vMeshes.length = 0; const seen = new Set();
  for (const t of [near, far]) {
    const c = chunks.get(Math.floor((o.x + d.x * t) / CS) + ',' + Math.floor((o.z + d.z * t) / CS)); if (!c || seen.has(c)) continue; seen.add(c);
    for (const m of c.group.children) if (m.isMesh && !m.isInstancedMesh && m.userData.kind && !VIS_SKIP.has(m.userData.kind)) _vMeshes.push(m);
  }
  if (!_vMeshes.length) return null;
  _vRay.set(o, d); _vRay.near = Math.max(0, near); _vRay.far = far;
  const hit = _vRay.intersectObjects(_vMeshes, false)[0]; if (!hit) return null;
  return { kind: hit.object.userData.kind, tint: hit.object.userData.tint, point: hit.point, dist: hit.distance, normal: hit.face.normal.clone() };
}
// h — результат camRay: материал в точке (с кэшем, т.к. вызывается каждый кадр при удержании E)
function visualHit(h) {
  if (!h) return null;
  const k = h.collider.handle + ':' + Math.round(h.point.x * 40) + ',' + Math.round(h.point.y * 40) + ',' + Math.round(h.point.z * 40);
  if (_vCache.has(k)) return _vCache.get(k);
  const o = h.point.clone().addScaledVector(h.dir, -.15), r = visualRay(o, h.dir, 0, .3);
  if (_vCache.size > 300) _vCache.clear(); _vCache.set(k, r); return r;
}
// ---------------- chalk marks (persistent)
const chalkMarks = [];
function addChalkMark(m, silent = false) {
  const floor = m.ny > .7;
  const mat = new THREE.MeshBasicMaterial({ map: floor ? TEX.chalkArrow : TEX.chalkX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, color: 0x9a9890 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(floor ? .6 : .45, floor ? .6 : .45), mat);
  const n = V3(m.nx, m.ny, m.nz); mesh.position.set(m.x, m.y, m.z).addScaledVector(n, .006);
  if (floor) { mesh.rotation.set(-Math.PI / 2, 0, 0); mesh.rotateZ(m.yaw); } else { mesh.lookAt(mesh.position.clone().add(n)); mesh.rotateZ(m.yaw); }
  const l = sampleLight(m.x, m.y + .1, m.z); mat.color.setRGB(clamp(l.r * 1.6, .03, 1), clamp(l.g * 1.6, .03, 1), clamp(l.b * 1.6, .03, 1));
  mesh.userData.noAO = true; scene.add(mesh); m.mesh = mesh; chalkMarks.push(m);
  if (chalkMarks.length > 80) removeChalk(chalkMarks[0]);
  if (!silent) bus.emit('chalk:drawn', m);
  return m;
}
function removeChalk(m) { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); chalkMarks.splice(chalkMarks.indexOf(m), 1); }
function drawChalk() {
  const h = camRay(3); if (!h) return false;
  const floor = h.normal.y > .7;
  addChalkMark({ x: h.point.x, y: h.point.y, z: h.point.z, nx: h.normal.x, ny: h.normal.y, nz: h.normal.z, yaw: floor ? Math.atan2(-h.dir.x, -h.dir.z) : rand(-.2, .2) });
  audio.chalk(h.point); return true;
}
function dropSlot(i, all = false) {
  const s = inv.slots[i]; if (!s) return; const n = all ? s.n : 1;
  for (let k = 0; k < n; k++) {
    const id = inv.takeSlot(i), d = camera.getWorldDirection(V3());
    spawnItem(id, camera.getWorldPosition(V3()).addScaledVector(d, .5).add(V3(rand(-.05, .05), k * .04, rand(-.05, .05))), d.multiplyScalar(3.5).add(V3(0, 1, 0)));
  }
  player.noise += .05; bus.emit('player:drop', {});
}

