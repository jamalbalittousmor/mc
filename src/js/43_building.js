// =====================================================================
//  BUILDING
// =====================================================================
const BOX = (x0, y0, z0, x1, y1, z1, m) => [x0, y0, z0, x1, y1, z1, m];
const BUILD = [
  { id: 'wall2', name: 'Стена 2 м', cost: { panel: 2 }, snap: .5, parts: () => [BOX(-1, 0, -.07, 1, 2.6, .07, 'drywall')], wall: true },
  { id: 'wall1', name: 'Стена 1 м', cost: { panel: 1 }, snap: .5, parts: () => [BOX(-.5, 0, -.07, .5, 2.6, .07, 'drywall')], wall: true },
  { id: 'half', name: 'Полустенка', cost: { panel: 1 }, snap: .5, parts: () => [BOX(-1, 0, -.07, 1, 1.1, .07, 'drywall')], wall: true },
  { id: 'frame', name: 'Дверной проём', cost: { panel: 2 }, snap: .5, parts: () => [BOX(-1, 0, -.07, -.5, 2.6, .07, 'drywall'), BOX(.5, 0, -.07, 1, 2.6, .07, 'drywall'), BOX(-.5, 2.15, -.07, .5, 2.6, .07, 'drywall')], wall: true },
  { id: 'door', name: 'Дверь', cost: { plank: 3 }, snap: .25, parts: () => [BOX(0, 0, -.03, .98, 2.12, .03, 'wood')], door: true, wall: true },
  { id: 'floor', name: 'Настил 2×2', cost: { plank: 2 }, snap: .5, parts: () => [BOX(-1, 0, -1, 1, .1, 1, 'wood')] },
  { id: 'stairs', name: 'Лестница', cost: { plank: 3 }, snap: .5, parts: () => Array.from({ length: 6 }, (_, i) => BOX(-.6, 0, -1 + i / 3, .6, (i + 1) * .2, -1 + (i + 1) / 3 + (i === 5 ? 0 : 0), 'wood')) },
  { id: 'pillar', name: 'Столб', cost: { plank: 1 }, snap: .25, parts: () => [BOX(-.12, 0, -.12, .12, 2.6, .12, 'wood')] },
  { id: 'crate', name: 'Ящик (физика)', cost: { plank: 1 }, snap: .05, parts: () => [BOX(-.375, 0, -.375, .375, .75, .375, 'wood')], dynamic: true },
  { id: 'lamp', name: 'Торшер', cost: { plank: 1, wire: 1, bulb: 1 }, snap: .05, parts: () => [BOX(-.18, 0, -.18, .18, .04, .18, 'metal'), BOX(-.025, .04, -.025, .025, 1.45, .025, 'metal')], lamp: true },
  { id: 'bed', name: 'Лежанка', cost: { cloth: 2, plank: 1 }, snap: .25, parts: () => [BOX(-.45, 0, -1, .45, .18, 1, 'cloth'), BOX(-.35, .18, .55, .35, .28, .9, 'drywall')], bed: true },
];
const BUILD_BY_ID = Object.fromEntries(BUILD.map(b => [b.id, b]));
// stairs: make each step solid down to the floor
BUILD_BY_ID.stairs.parts = () => Array.from({ length: 6 }, (_, i) => BOX(-.6, 0, -1 + i / 3, .6, (i + 1) * .2, -1 + (i + 1) / 3, 'wood'));
const build = { on: false, sel: 0, rot: 0, fine: 0, ghost: null, valid: false, pos: V3(), yaw: 0, why: '' };
const placed = new Map(); // collider handle -> piece
const pieces = new Set();
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fe8a0, transparent: true, opacity: .3, depthWrite: false });
function partsBounds(parts) { const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]; for (const p of parts) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], p[i]); b[i + 3] = Math.max(b[i + 3], p[i + 3]); } return b; }
function pieceObject(def, ghost) {
  const g = new THREE.Group(), byMat = new Map();
  for (const p of def.parts()) { const k = p[6]; if (!byMat.has(k)) byMat.set(k, new GB(...UVS[k])); byMat.get(k).box(p[0], p[1], p[2], p[3], p[4], p[5], '', .5); }
  for (const [k, b] of byMat) { const m = new THREE.Mesh(b.geo(), ghost ? ghostMat : zmat(k)); m.castShadow = !ghost; m.receiveShadow = !ghost; if (ghost) m.userData.noAO = true; g.add(m); }
  if (def.visual) def.visual(g, ghost, THREE);
  if (def.lamp) {
    const shadeMat = ghost ? ghostMat : new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .82, .55).multiplyScalar(2.5), side: THREE.DoubleSide });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.13, .22, .26, 16, 1, true).translate(0, 1.5, 0), shadeMat); g.add(shade); g.userData.shadeMat = shadeMat;
  }
  if (ghost) g.userData.noAO = true;
  return g;
}
function setBuildMode(on) {
  build.on = on;
  if (build.ghost) { scene.remove(build.ghost); build.ghost = null; }
  if (on) { build.ghost = pieceObject(BUILD[build.sel], true); scene.add(build.ghost); }
  bus.emit('build:mode', on); renderBuildHud();
}
const canAfford = def => Object.entries(def.cost).every(([k, n]) => inv.count(k) >= n);
const yAxis = V3(0, 1, 0);
function updateBuild() {
  if (!build.on || !build.ghost) return;
  const def = BUILD[build.sel], h = camRay(6);
  build.valid = false; build.why = '';
  if (!h) { build.ghost.visible = false; return; }
  const hp = placed.get(h.collider.handle);
  let yaw = (hp ? hp.yaw : 0) + build.rot * Math.PI / 2 + build.fine * Math.PI / 12;
  let pos;
  if (def.door && hp && hp.def.id === 'frame') { yaw = hp.yaw; pos = V3(-.49, 0, 0).applyAxisAngle(yAxis, yaw).add(hp.pos); }
  else {
    if (h.normal.y < .7) { build.ghost.visible = false; build.why = 'Нужна горизонтальная поверхность'; return; }
    const origin = hp ? hp.pos : V3(), baseYaw = hp ? hp.yaw : 0;
    const d = h.point.clone().sub(origin).applyAxisAngle(yAxis, -baseYaw), sn = def.snap;
    d.x = Math.round(d.x / sn) * sn; d.z = Math.round(d.z / sn) * sn;
    pos = d.applyAxisAngle(yAxis, baseYaw).add(origin); pos.y = h.point.y;
  }
  const b = partsBounds(def.parts()), q = new THREE.Quaternion().setFromAxisAngle(yAxis, yaw);
  const c = V3((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2).applyQuaternion(q).add(pos);
  const shape = new RAPIER.Cuboid(Math.max(.01, (b[3] - b[0]) / 2 - .04), Math.max(.01, (b[4] - b[1]) / 2 - .04), Math.max(.01, (b[5] - b[2]) / 2 - .04));
  const hit = world.intersectionWithShape({ x: c.x, y: c.y + .02, z: c.z }, q, shape);
  build.pos.copy(pos); build.yaw = yaw;
  build.ghost.visible = true; build.ghost.position.copy(pos); build.ghost.quaternion.copy(q);
  if (hit) build.why = 'Мешает препятствие'; else if (!canAfford(def)) build.why = 'Не хватает материалов'; else if (h.dist < .7) build.why = 'Слишком близко';
  build.valid = !build.why;
  ghostMat.color.set(build.valid ? 0x9fe8a0 : 0xe88a7a);
}
function createPiece(id, pos, yaw, extra = {}) {
  const def = BUILD_BY_ID[id]; if (!def) return null;
  const obj = pieceObject(def, false), q = new THREE.Quaternion().setFromAxisAngle(yAxis, yaw);
  obj.position.copy(pos); obj.quaternion.copy(q); scene.add(obj);
  const desc = def.dynamic ? RAPIER.RigidBodyDesc.dynamic() : def.door ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.fixed();
  const body = world.createRigidBody(desc.setTranslation(pos.x, pos.y, pos.z).setRotation(q));
  const piece = { def, obj, body, cols: [], pos: pos.clone(), yaw, open: false, ang: 0 };
  for (const p of def.parts()) {
    const col = world.createCollider(RAPIER.ColliderDesc.cuboid((p[3] - p[0]) / 2, (p[4] - p[1]) / 2, (p[5] - p[2]) / 2).setTranslation((p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2).setDensity(def.dynamic ? 120 : 1).setFriction(.7), body);
    piece.cols.push(col); placed.set(col.handle, piece);
  }
  if (def.dynamic && extra.rot) { body.setTranslation(extra.p, true); body.setRotation(extra.rot, true); }
  obj.traverse(o => { if (o.isMesh && !o.material.isMeshBasicMaterial) bakeVertsWithProbe(o.geometry, o); });
  if (def.lamp) { piece.light = { x: pos.x, y: pos.y + 1.35, z: pos.z, color: 0xffd9a0, mult: .55, on: true, mat: obj.userData.shadeMat }; }
  if (def.door && extra.open) { piece.open = true; }
  if (def.machine) Machines.attach(piece, extra.m);
  Mods.emit('piece:create', piece);
  pieces.add(piece); return piece;
}
function placePiece() {
  const def = BUILD[build.sel];
  if (!build.valid) { audio.click(); if (build.why) say(build.why, 2); return; }
  for (const [k, n] of Object.entries(def.cost)) inv.take(k, n);
  const piece = createPiece(def.id, build.pos, build.yaw);
  audio.thud(build.pos); player.noise += .12; bus.emit('build:placed', piece);
}
function removePieceObj(piece) {
  if (piece.machine) Machines.detach(piece);
  scene.remove(piece.obj); piece.obj.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  for (const c of piece.cols) placed.delete(c.handle);
  world.removeRigidBody(piece.body); pieces.delete(piece);
}
function dismantle() {
  const h = camRay(6); if (!h) return; const piece = placed.get(h.collider.handle); if (!piece) return;
  removePieceObj(piece);
  for (const [k, n] of Object.entries(piece.def.cost)) { const left = inv.add(k, n); if (left) for (let i = 0; i < left; i++) spawnItem(k, h.point.clone().add(V3(0, .3, 0))); }
  audio.crack(h.point); player.noise += .12; bus.emit('build:removed', piece);
}
function toggleDoor(piece, silent = false) { piece.open = !piece.open; if (!silent) audio.creak(piece.pos); bus.emit('door:toggle', piece); }
function updatePieces(dt) {
  for (const pc of pieces) {
    if (pc.def.dynamic) { const tr = pc.body.translation(), r = pc.body.rotation(); pc.obj.position.set(tr.x, tr.y, tr.z); pc.obj.quaternion.set(r.x, r.y, r.z, r.w); }
    else if (pc.def.door) {
      const target = pc.open ? -Math.PI * .48 : 0; if (Math.abs(pc.ang - target) < 1e-3) continue;
      pc.ang = moveTo(pc.ang, target, dt * 3.2); const q = new THREE.Quaternion().setFromAxisAngle(yAxis, pc.yaw + pc.ang);
      pc.body.setNextKinematicRotation(q); pc.obj.quaternion.copy(q);
    }
  }
}
function updateShelter() {
  const fp = feetPos(); let walls = 0, lamp = false, bed = false;
  for (const pc of pieces) {
    const d = pc.pos.distanceTo(fp);
    if (pc.def.wall && d < 4.5) walls += pc.def.id === 'wall1' ? .5 : 1;
    if (pc.light && pc.light.on && d < 5) lamp = true;
    if (pc.def.bed && d < 4) bed = true;
  }
  const lit = lamp || player.lightLevel > .22;
  const was = player.inShelter;
  player.inShelter = walls >= 3 && lit;
  player.shelterInfo = { walls, lit, bed };
  if (player.inShelter && !was) { say('Здесь можно перевести дух. Убежище.', 4); bus.emit('shelter:enter'); }
}

