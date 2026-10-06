// =====================================================================
//  ITEMS
// =====================================================================
const ITEMS = {
  almond: { name: 'Миндальная вода', icon: '🧴', stack: 5, use: { thirst: 45, sanity: 12 }, desc: 'Тёплая, сладковатая. Утоляет жажду и успокаивает.', mesh: ['cyl', [.045, .2], 0xf2e6c4] },
  water: { name: 'Бутылка воды', icon: '💧', stack: 5, use: { thirst: 30 }, desc: 'Обычная вода. Пахнет пластиком.', mesh: ['cyl', [.04, .22], 0x9fc8d8] },
  bar: { name: 'Батончик', icon: '🍫', stack: 6, use: { hunger: 26 }, desc: 'Чуть подтаявший шоколадный батончик.', mesh: ['box', [.12, .02, .04], 0x7a3a22] },
  can: { name: 'Консервы', icon: '🥫', stack: 4, use: { hunger: 55, thirst: -6 }, desc: 'Тушёнка без этикетки. Сытно, но солоно.', mesh: ['cyl', [.04, .09], 0xa0a0a0] },
  pills: { name: 'Успокоительное', icon: '💊', stack: 6, use: { sanity: 28, panic: -.6, energy: -8 }, desc: 'Возвращает ясность мыслей. Немного клонит в сон.', mesh: ['box', [.06, .02, .04], 0xe8e8f0] },
  energy: { name: 'Энергетик', icon: '🥤', stack: 4, use: { energy: 35, thirst: 8, panic: .1 }, desc: 'Прогоняет сон. Сердце стучит чаще.', mesh: ['cyl', [.033, .12], 0x3a8a4a] },
  battery: { name: 'Батарейка', icon: '🔋', stack: 8, desc: 'Полностью заряжает фонарик.', mesh: ['cyl', [.018, .07], 0x2b2b2b] },
  chalk: { name: 'Мел', icon: '🖍️', stack: 4, desc: 'ЛКМ — метка на стене (крест) или на полу (стрелка по взгляду). Метки сохраняются.', mesh: ['box', [.09, .022, .022], 0xf4f2ea] },
  panel: { name: 'Гипсокартон', icon: '🧱', stack: 10, desc: 'Материал для стен.', mesh: ['box', [.6, .025, .4], 0xd2cdbb] },
  plank: { name: 'Доски', icon: '🪵', stack: 10, desc: 'Материал для настилов, лестниц, дверей и мебели.', mesh: ['box', [.7, .03, .12], 0x8a6a3c] },
  cloth: { name: 'Ткань', icon: '🧶', stack: 8, desc: 'Старая обивка. Пригодится для лежанки.', mesh: ['box', [.3, .03, .25], 0x5a5f6a] },
  wire: { name: 'Провод', icon: '🔌', stack: 8, desc: 'Моток проводки, выдранной из стены.', mesh: ['cyl', [.06, .03], 0x202020] },
  bulb: { name: 'Лампочка', icon: '💡', stack: 6, desc: 'Целая лампочка. Нужна для светильника.', mesh: ['cyl', [.035, .08], 0xe8e2c8] },
  note: { name: 'Записка', icon: '📄', stack: 1, desc: '', mesh: ['box', [.2, .004, .26], 0xe8e0c8] },
};
const LOOT_BASE = { almond: .13, water: .12, bar: .12, can: .06, pills: .05, energy: .05, battery: .1, chalk: .05, panel: .08, plank: .1, cloth: .05, wire: .045, bulb: .045 };
const LOOT_MOD = { pools: { water: 2, almond: 1.6, panel: .4, plank: .4 }, office: { panel: 1.6, wire: 2.2, bulb: 2, plank: 1.4, energy: 2, cloth: 1.6 }, dark: { battery: 2.2, pills: 1.6 }, maze: { chalk: 2, bar: 1.4 }, void: { almond: 1.5 } };
function lootPick(zone, r) {
  const mod = Mods.filter('loot:weights', { ...(LOOT_MOD[zone.key] || {}) }, zone); let tot = 0; for (const k in LOOT_BASE) tot += LOOT_BASE[k] * (mod[k] ?? 1);
  r *= tot; for (const k in LOOT_BASE) { r -= LOOT_BASE[k] * (mod[k] ?? 1); if (r <= 0) return k; } return 'almond';
}
const NOTES = [
  { t: 'Записка, подписанная «К.»', b: 'Если ты это читаешь — ты тоже провалился. Не паникуй. Здесь можно выжить: ищи воду, не сиди в темноте и не верь тому, что видишь краем глаза. Я видел дверь с зелёной надписью. ВЫХОД существует.' },
  { t: 'Листок в клетку', b: 'Лампы гудят, только когда что-то не так. Если вдруг стало слишком тихо — это нормально. Если стало слишком громко — уходи. Я помечаю стены мелом. Иногда мои метки... не там, где я их оставлял.' },
  { t: 'Обрывок инструкции', b: '…поддерживать освещение в жилых секторах. При отключении питания персоналу предписано оставаться на месте и не следовать звукам шагов…' },
  { t: 'Записка «К.» (2)', b: 'Я построил себе угол: пара стен, лампа, лежанка. В свете спится. Без света — снится. Выход где-то далеко, я записал направление на обороте трёх записок. Собери их.' },
  { t: 'Детский рисунок', b: 'Жёлтые стены, жёлтый пол, и в углу — человечек без лица. Подпись: «он стоит только там, куда не смотришь».' },
  { t: 'Записка «К.» (3)', b: 'Плавать умеешь? В бассейнах вода тёплая, как в ванной. Выбираться — к бортику, вверх. И не ныряй надолго, там гул ламп слышно даже под водой.' },
  { t: 'Квитанция', b: 'На обороте карандашом: «2 дня без сна. Стены дышат. Если остановиться и прислушаться — шаги тоже останавливаются».' },
  { t: 'Последняя записка «К.»', b: 'Я почти у двери. Если не выберусь — моё не трогай, а впрочем, бери. Тут всё равно ничего не принадлежит никому.' },
];
function noteAt(gx, gz) { return Math.hypot(gx * CELL, gz * CELL) > 28 && hash3(gx, gz, 1234) < BAL.noteCell && !isPool(gx, gz); }
const itemGeoCache = new Map();
function itemMesh(id) {
  const [shape, s, color] = ITEMS[id].mesh;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .6, metalness: id === 'battery' || id === 'can' ? .6 : 0, map: id === 'note' ? TEX.note : null });
  // геометрия общая для всех экземпляров предмета (меньше аллокаций)
  let geo = itemGeoCache.get(id);
  if (!geo) { geo = shape === 'cyl' ? new THREE.CylinderGeometry(s[0], s[0], s[1], 10) : new THREE.BoxGeometry(s[0], s[1], s[2]); if (id === 'battery') geo.rotateZ(Math.PI / 2); geo.userData.shared = true; itemGeoCache.set(id, geo); }
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m;
}
const itemHalf = id => { const [shape, s] = ITEMS[id].mesh; if (id === 'battery') return [s[1] / 2, s[0], s[0]]; return shape === 'cyl' ? [s[0], s[1] / 2, s[0]] : [s[0] / 2, s[1] / 2, s[2] / 2]; };
const worldItems = new Set(); const pickedKeys = new Set(); const itemByCollider = new Map();
function spawnItem(id, pos, vel = null, opts = {}) {
  const mesh = itemMesh(id); mesh.position.copy(pos); scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setLinearDamping(.4).setAngularDamping(.6).setCcdEnabled(true));
  if (!vel) body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6.28, 0)), true);
  const h = itemHalf(id);
  const col = world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(h[0], .02), Math.max(h[1], .01), Math.max(h[2], .02)).setDensity(400).setFriction(.8).setRestitution(.12), body);
  if (vel) { body.setLinvel(vel, true); body.setAngvel({ x: rand(-4, 4), y: rand(-4, 4), z: rand(-4, 4) }, true); }
  const it = { id, mesh, body, col, chunkKey: opts.chunkKey || null, key: opts.key || null, probeT: 0 };
  mesh.userData.item = it; itemByCollider.set(col.handle, it); worldItems.add(it); return it;
}
function removeItem(it) {
  scene.remove(it.mesh); if (!it.mesh.geometry.userData.shared) it.mesh.geometry.dispose(); it.mesh.material.dispose();
  itemByCollider.delete(it.col.handle); world.removeRigidBody(it.body); worldItems.delete(it);
}

