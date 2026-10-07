// =====================================================================
//  DIRECTOR — events react to what the player does (noise, darkness,
//  building, chalk, swimming, sleeping). No monsters, no screamers.
// =====================================================================
const dir = {
  attention: .1, next: 25, hum: 0, humT: 0, humTarget: 0, lastEvent: '', blackout: 0, brown: 0, powerTarget: 1,
  walkT: 0, lastStepT: 0, echoCd: 30, pending: [], log: [], count: 0, sleepDisturb: 0, humScan: 0, humNear: 0, silence: 0, darkStill: 0, breathCd: 40,
};
function later(sec, fn) { dir.pending.push({ t: clock.elapsedTime + sec, fn }); }
function camFwd() { return camera.getWorldDirection(V3()).setY(0).normalize(); }
function behindPos(dist = 8, spread = .9) { const f = camFwd(), a = rand(-spread, spread); const d = f.clone().applyAxisAngle(yAxis, Math.PI + a).multiplyScalar(dist); return camera.position.clone().add(d).setY(1); }
function sidePos(dist) { const a = rand(0, Math.PI * 2); return camera.position.clone().add(V3(Math.cos(a) * dist, 0, Math.sin(a) * dist)).setY(1); }
function inView(p, cos = .55) { const d = p.clone().sub(camera.position).normalize(); return d.dot(camera.getWorldDirection(V3())) > cos; }
function nearFixtures(r, litOnly = true) { const out = [], cp = camera.position; for (const c of chunks.values()) for (const e of c.fixtures) { const f = e.f; if (litOnly && !fixtureLit(f)) continue; const d = Math.hypot(f.x - cp.x, f.z - cp.z); if (d < r) out.push({ f, d }); } return out.sort((a, b) => a.d - b.d); }
const STEP_GEO = new THREE.PlaneGeometry(.22, .44), STEP_GEO2 = new THREE.PlaneGeometry(.6, .6);
function nearClosedDoor() { const cp = camera.position; return [...WorldObj.doors].find(o => Math.abs(o.s.open) < .1 && o.pos.distanceTo(cp) < 12 && o.pos.distanceTo(cp) > 3 && inView(o.pos, .6)); }
// силуэт в дальнем проёме: стоит, пока на него не смотрят пристально или не подходят ближе
const SIL = { on: false, mesh: null, t: 0, look: 0 };
{ const g = new THREE.CapsuleGeometry(.24, 1.25, 4, 8), m = new THREE.MeshBasicMaterial({ color: 0x020202, fog: true }); SIL.mesh = new THREE.Mesh(g, m); SIL.mesh.visible = false; SIL.mesh.userData.noAO = true; scene.add(SIL.mesh); }
function spawnSilhouette() {
  const cp = camera.position, fwd = camFwd(), a = rand(-.35, .35), d = fwd.clone().applyAxisAngle(yAxis, a);
  const hit = world.castRay(new RAPIER.Ray({ x: cp.x, y: cp.y, z: cp.z }, { x: d.x, y: 0, z: d.z }), 40, true, undefined, undefined, player.col);
  const dist = hit ? hit.timeOfImpact : 40; if (dist < 16) return false;
  const p = cp.clone().addScaledVector(d, Math.min(dist - 1.2, 30)); if (isPoolAt(p.x, p.z)) return false;
  SIL.mesh.position.set(p.x, floorY(p.x, p.z) + .87, p.z); SIL.mesh.visible = true; SIL.on = true; SIL.t = rand(5, 9); SIL.look = 0; return true;
}
function updateSilhouette(dt) {
  if (!SIL.on) return; SIL.t -= dt; const p = SIL.mesh.position, d = p.distanceTo(camera.position);
  if (inView(p, .985)) SIL.look += dt;
  if (SIL.t <= 0 || SIL.look > .7 || d < 11) { SIL.on = false; SIL.mesh.visible = false; if (SIL.look > .7 || d < 11) { addPanic(.12); later(.6, () => say(pick(['Там кто-то стоял. Секунду назад.', 'Силуэт исчез, стоило присмотреться.']), 3)); } }
}
function humEvent(level, sec) { dir.humTarget = Math.max(dir.humTarget, level); dir.humT = Math.max(dir.humT, sec); }
const H_TEXT = {
  steps: ['Шаги. Где-то за стеной.', 'Кто-то идёт. Не сюда. Пока.', 'Шаги стихли за поворотом.'],
  echo: ['Шаги остановились на полсекунды позже твоих.', 'Это было эхо?', 'Ты остановился. Кто-то за спиной — тоже.'],
  whisper: ['…слышен шёпот, слов не разобрать.', 'Кто-то произнёс твоё имя? Нет. Показалось.', '«…не туда…»'],
  knockReply: ['Из-за стен стучат. Будто в ответ на твою стройку.', 'Тук. Тук. Тук. Кто-то повторяет твой ритм.'],
  chalk: ['Твоя метка… она была повёрнута иначе?', 'Здесь стрелка мелом. Ты её не рисовал.'],
  item: ['Ты точно оставлял это здесь?'],
  shift: ['Что-то изменилось. Коридор позади выглядит иначе.', 'Ты уверен, что проходил здесь?'],
  black: ['Свет погас. Везде.', 'Тишина стала абсолютной.'],
  brown: ['Лампы тускнеют и снова набирают силу.'],
  dies: ['Лампа над головой лопнула.'],
  chase: ['Свет гаснет… ряд за рядом… к тебе.'],
  slam: ['Где-то хлопнула дверь. Твоя дверь.'],
  water: ['Под водой отчётливо слышен голос.'],
  breath: ['Дыхание. Прямо за спиной. Не оборачивайся… или обернись.'],
};
const EVENTS = {
  distant_steps: { w: () => 1 + dir.attention, run() { const p = sidePos(rand(10, 16)); audio.phantomSteps(p, V3(rand(-1, 1), 0, rand(-1, 1)).normalize(), 4 + (Math.random() * 5 | 0), zoneAt(p.x, p.z).mat === 'tile' ? 'tile' : 'carpet', 560); if (Math.random() < .4) say(pick(H_TEXT.steps), 4); addPanic(.04); } },
  knock: { w: () => .6, run() { audio.knock(sidePos(rand(5, 10))); addPanic(.04); } },
  scrape: { w: () => .4 + dir.attention * .5, run() { audio.scrape(sidePos(rand(8, 14))); addPanic(.05); } },
  drip: { w: () => zoneAt(camera.position.x, camera.position.z).flood || zoneAt(camera.position.x, camera.position.z).key === 'pools' ? 2 : .3, run() { const p = sidePos(rand(2, 6)); for (let i = 0; i < 4; i++) later(i * rand(.6, 1.4), () => audio.drip(p)); } },
  whisper: { w: () => player.st.sanity < 50 ? 1.4 * (1 - player.st.sanity / 50) + .3 : 0, run() { audio.whisper(behindPos(rand(1.5, 3))); if (Math.random() < .6) say(pick(H_TEXT.whisper), 4); addPanic(.07); } },
  breath: { w: () => player.st.sanity < 30 && player.lightLevel < .15 ? 1 : 0, run() { audio.breath(behindPos(.8, .3)); say(pick(H_TEXT.breath), 4); addPanic(.12); } },
  brownout: { w: () => POWER.value > .9 && CURFEW.state === 'idle' ? .5 + dir.attention : 0, run() { dir.brown = rand(2.5, 5); audio.humDetune(-120, dir.brown); humEvent(.9, dir.brown + 1); audio.humBurst(null); say(pick(H_TEXT.brown), 3); addPanic(.03); } },
  blackout: { w: () => POWER.value > .9 && dir.attention > .45 && CURFEW.state === 'idle' ? .5 * dir.attention : 0, run() { dir.blackout = rand(10, 22); audio.powerDown(); humEvent(0, 0); dir.humTarget = 0; say(pick(H_TEXT.black), 4); addPanic(.25); bus.emit('world:blackout'); } },
  light_dies: { w: () => player.noise > .3 || dir.attention > .5 ? 1 : .2, run() { const n = nearFixtures(9); if (!n.length) return false; const f = pick(n.slice(0, 3)).f; flickerFixture(f, .8); humEvent(.6, 1.2); later(.8, () => { audio.pop(V3(f.x, f.y, f.z)); audio.crackle(V3(f.x, f.y, f.z), 1); setFixtureOff(f, true, true); }); say(pick(H_TEXT.dies), 3); addPanic(.08); } },
  lights_chase: { w: () => dir.attention > .35 ? .7 : .1, run() {
    const n = nearFixtures(20).filter(o => o.d > 3).sort((a, b) => b.d - a.d).slice(0, 7); if (n.length < 3) return false;
    humEvent(1, 6); say(pick(H_TEXT.chase), 3);
    n.forEach((o, i) => later(i * .45, () => { audio.thud(V3(o.f.x, o.f.y, o.f.z)); setFixtureOff(o.f, true); }));
    const back = n.length * .45 + rand(4, 8);
    n.forEach((o, i) => later(back + i * .15, () => { flickerFixture(o.f, .6); setFixtureOff(o.f, false); }));
    addPanic(.2);
  } },
  hum_flicker: { w: () => .9, run() { const n = nearFixtures(8); if (!n.length) return false; const f = n[0].f; flickerFixture(f, rand(3, 7)); humEvent(.8, 5); } },
  chalk_moved: { w: () => chalkMarks.some(m => m.mesh && !inView(m.mesh.position, .3) && m.mesh.position.distanceTo(camera.position) > 7) ? .9 : 0, run() {
    const c = chalkMarks.filter(m => !inView(m.mesh.position, .3) && m.mesh.position.distanceTo(camera.position) > 7); if (!c.length) return false;
    const m = pick(c); const nm = { ...m, yaw: m.yaw + (m.ny > .7 ? rand(1.5, 3.1) : rand(.6, 1.2)) }; delete nm.mesh; removeChalk(m); addChalkMark(nm, true); dir.chalkHint = nm;
  } },
  helper_arrow: { w: () => notesRead().length >= 2 ? .5 : .15, run() {
    const fp = feetPos(), fwd = camFwd(); const p = fp.clone().addScaledVector(fwd, -rand(5, 8)); if (inView(V3(p.x, 1, p.z), .2)) return false;
    const hit = world.castRay(new RAPIER.Ray({ x: p.x, y: 1.5, z: p.z }, { x: 0, y: -1, z: 0 }), 3, true, undefined, undefined, player.col); if (!hit) return false;
    const y = 1.5 - hit.timeOfImpact; if (Math.abs(y) > .2) return false;
    const yaw = Math.atan2(-(WORLD.exitX - p.x), -(WORLD.exitZ - p.z)) + (Math.random() < .25 ? Math.PI : 0); // sometimes a lie
    addChalkMark({ x: p.x, y: y + .002, z: p.z, nx: 0, ny: 1, nz: 0, yaw }, true); dir.chalkFound = true;
  } },
  item_moved: { w: () => [...worldItems].some(it => !it.key && it.mesh.position.distanceTo(camera.position) > 6 && !inView(it.mesh.position, .3)) ? .6 : 0, run() {
    const c = [...worldItems].filter(it => !it.key && it.mesh.position.distanceTo(camera.position) > 6 && !inView(it.mesh.position, .3)); if (!c.length) return false;
    const it = pick(c), p = it.body.translation(); it.body.setTranslation({ x: p.x + rand(-1, 1), y: p.y + .3, z: p.z + rand(-1, 1) }, true);
  } },
  geometry_shift: { w: () => player.st.sanity < 60 ? .5 : .15, run() {
    const fp = feetPos(), pcx = Math.floor(fp.x / CS), pcz = Math.floor(fp.z / CS), fwd = camFwd();
    const cands = [];
    for (const c of chunks.values()) {
      if (c.cx === pcx && c.cz === pcz) continue; if (Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz)) > 1) continue;
      if (c.cx === WORLD.exitCx && c.cz === WORLD.exitCz) continue; if (Math.abs(c.cx) <= 1 && Math.abs(c.cz) <= 1) continue;
      const ccx = c.cx * CS + CS / 2, ccz = c.cz * CS + CS / 2; const d = V3(ccx - fp.x, 0, ccz - fp.z).normalize(); if (d.dot(fwd) > -.3) continue;
      const box = (p) => p.x > c.cx * CS - 1 && p.x < c.cx * CS + CS + 1 && p.z > c.cz * CS - 1 && p.z < c.cz * CS + CS + 1;
      if ([...pieces].some(pc => box(pc.pos)) || chalkMarks.some(m => box(m))) continue;
      cands.push(c);
    }
    if (!cands.length) return false;
    const c = pick(cands); variants.set(c.key, (variants.get(c.key) || 0) + 1); rebuildChunk(c.cx, c.cz); dir.shifted = true;
    later(rand(6, 14), () => { if (Math.random() < .5) say(pick(H_TEXT.shift), 4); });
  } },
  door_slam: { w: () => [...pieces].some(p => p.def.door && p.open && !inView(p.pos, .2) && p.pos.distanceTo(camera.position) > 4) ? 1 : 0, run() {
    const d = [...pieces].filter(p => p.def.door && p.open && !inView(p.pos, .2) && p.pos.distanceTo(camera.position) > 4); if (!d.length) return false;
    const p = pick(d); toggleDoor(p, true); audio.slam(p.pos); say(pick(H_TEXT.slam), 3); addPanic(.15);
  } },
  world_door_slam: { w: () => [...WorldObj.doors].some(o => Math.abs(o.s.open) > .1 && !inView(o.pos, .2) && o.pos.distanceTo(camera.position) > 5 && o.pos.distanceTo(camera.position) < 22) ? .8 + dir.attention : 0, run() {
    const d = [...WorldObj.doors].filter(o => Math.abs(o.s.open) > .1 && !inView(o.pos, .2) && o.pos.distanceTo(camera.position) > 5 && o.pos.distanceTo(camera.position) < 22); if (!d.length) return false;
    pick(d).slam(); later(.4, () => say(pick(['Где-то хлопнула дверь.', 'Дверь. Сама. Сквозняков здесь нет.']), 3)); addPanic(.14);
  } },
  door_knock: { w: () => [...WorldObj.doors].some(o => Math.abs(o.s.open) < .1 && o.pos.distanceTo(camera.position) < 9) ? .6 + dir.attention : 0, run() {
    const d = [...WorldObj.doors].filter(o => Math.abs(o.s.open) < .1 && o.pos.distanceTo(camera.position) < 9); if (!d.length) return false;
    const o = pick(d); audio.knock(o.pos); later(rand(2, 4), () => say(pick(['Стук. С той стороны двери.', 'Кто-то стучит. Вежливо. Терпеливо.']), 3)); addPanic(.1);
    if (Math.random() < .3) o.s.locked = true;
  } },
  switch_off: { w: () => [...WorldObj.switches].some(o => !o.s.off && o.pos.distanceTo(camera.position) < 14 && !inView(o.pos, .4)) ? .5 + dir.attention * 1.5 : 0, run() {
    const c = [...WorldObj.switches].filter(o => !o.s.off && o.pos.distanceTo(camera.position) < 14 && !inView(o.pos, .4)); if (!c.length) return false;
    const o = pick(c); audio.click(); later(.05, () => WorldObj.flip(o, true, true)); audio.latch(o.pos); later(1, () => say(pick(['Щёлк. Кто-то выключил свет.', 'Выключатель щёлкнул. Ты его не трогал.']), 4)); addPanic(.2);
  } },
  phone_ring: { w: () => [...WorldObj.phones].some(o => o.ringT <= 0 && o.pos.distanceTo(camera.position) < 30) ? 1.2 : 0, run() {
    const c = [...WorldObj.phones].filter(o => o.ringT <= 0 && o.pos.distanceTo(camera.position) < 30); if (!c.length) return false;
    WorldObj.ring(pick(c), rand(12, 20)); later(2.5, () => say('Где-то звонит телефон.', 3)); addPanic(.04);
  } },
  watcher: { w: () => game.playT > BAL.watcherMinT && !Watcher.on ? (player.lightLevel < BAL.dimLevel ? .8 : .25) * (1 + (WORLD.level - 1) * .3) : 0, run() { return Watcher.spawn(); } },
  // ---- тонкие события: без скримеров, на периферии внимания
  door_shadow: { w: () => nearClosedDoor() ? .7 + dir.attention : 0, run() {
    const o = nearClosedDoor(); if (!o) return false; const p = o.pos, cp = camera.position;
    // светильник по ту сторону двери на мгновение «перекрывает» кто-то, проходящий мимо
    let best = null, bd = 1e9; for (const n of nearFixtures(22)) { const d = Math.hypot(n.f.x - p.x, n.f.z - p.z); const side = (n.f.x - p.x) * (cp.x - p.x) + (n.f.z - p.z) * (cp.z - p.z); if (side < 0 && d < bd) { bd = d; best = n.f; } }
    if (!best || bd > 7) return false;
    dimFixture(best, rand(.7, 1.3), .08); later(.3, () => audio.cloth(.25)); later(1.6, () => say(pick(['Под дверью мелькнула тень.', 'За дверью кто-то прошёл. Свет на миг пропал.']), 3)); addPanic(.08);
  } },
  far_silhouette: { w: () => player.st.sanity < 75 && !SIL.on ? .5 + (1 - player.st.sanity / 100) : .05, run() { return spawnSilhouette(); } },
  corridor_dies: { w: () => .45 + dir.attention * .5, run() {
    const cp = camera.position, fwd = camFwd(), n = nearFixtures(30).filter(o => o.d > 14 && V3(o.f.x - cp.x, 0, o.f.z - cp.z).normalize().dot(fwd) > .8).sort((a, b) => b.d - a.d).slice(0, 6);
    if (n.length < 2) return false; const back = rand(6, 11);
    n.forEach((o, i) => later(i * .35, () => { dimFixture(o.f, back - i * .35 + i * .5, 0); if (i === 0) audio.thud(V3(o.f.x, o.f.y, o.f.z)); }));
    later(back + 1, () => { for (const o of n) flickerFixture(o.f, .5); }); addPanic(.06);
  } },
  silence: { w: () => .3, run() { dir.silence = rand(6, 12); audio.humDetune(-60, 1.5); later(1.5, () => say(pick(['Гул стих. Совсем.', 'Тишина. Такая, что слышно собственную кровь.']), 4)); addPanic(.05); } },
  wet_steps: { w: () => .35 + dir.attention * .4, run() {
    const fp = feetPos(), fwd = camFwd(); if (Math.abs(fp.y) > .05 || player.swim) return false;
    const side = V3(-fwd.z, 0, fwd.x), p0 = fp.clone().addScaledVector(fwd, -rand(6, 9)); if (inView(V3(p0.x, .5, p0.z), .2)) return false;
    const yaw = Math.atan2(fwd.x, fwd.z), m = zmat('footprint');
    for (let i = 0; i < 6; i++) { const q = p0.clone().addScaledVector(fwd, i * .9).addScaledVector(side, (i & 1 ? .12 : -.12)); if (isPoolAt(q.x, q.z) || Math.abs(floorY(q.x, q.z)) > .01) continue; const me = new THREE.Mesh(STEP_GEO, m); me.position.set(q.x, .006, q.z); me.rotation.set(-Math.PI / 2, 0, yaw); me.userData.noAO = true; scene.add(me); later(rand(60, 120), () => scene.remove(me)); }
    later(rand(8, 20), () => say(pick(['Мокрые следы. Они ведут к тебе.', 'На полу следы босых ног. Свежие.']), 4)); addPanic(.05);
  } },
  ceiling_open: { w: () => .25, run() {
    const cp = camera.position, z = zoneAt(cp.x, cp.z); if (z.mat === 'tile' || z.ceilK === 'ceilC') return false;
    const fwd = camFwd(), p = cp.clone().addScaledVector(fwd, -rand(3, 6)); if (inView(V3(p.x, z.H, p.z), .3)) return false;
    const hx = Math.floor(p.x / .6) * .6 + .3, hz = Math.floor(p.z / .6) * .6 + .3; if (fixtureAt(Math.floor(hx / CELL), Math.floor(hz / CELL)) && Math.hypot(hx % CELL - 2, hz % CELL - 2) < 1) return false;
    const me = new THREE.Mesh(STEP_GEO2, zmat('hole')); me.position.set(hx, z.H - .005, hz); me.rotation.x = Math.PI / 2; const c = chunks.get(Math.floor(hx / CS) + ',' + Math.floor(hz / CS)); if (!c) return false; c.group.add(me);
    audio.scrape(V3(hx, z.H, hz)); later(rand(10, 25), () => say('Одна потолочная плитка сдвинута. Раньше так не было.', 4)); addPanic(.04);
  } },
  underwater_voice: { w: () => player.under ? 3 : 0, run() { audio.voice(camera.position.clone().add(V3(rand(-4, 4), -1, rand(-4, 4)))); say(pick(H_TEXT.water), 3); addPanic(.1); } },
};
function runEvent(name) {
  const e = EVENTS[name]; if (!e) return false;
  const ok = e.run() !== false; if (ok) { dir.lastEvent = name; dir.count++; bus.emit('director:event', name); }
  return ok;
}
function randomEvent() {
  const list = Object.entries(EVENTS).map(([k, e]) => [k, k === dir.lastEvent ? 0 : Math.max(0, e.w())]).filter(x => x[1] > 0);
  let tot = list.reduce((a, x) => a + x[1], 0), r = Math.random() * tot;
  for (const [k, w] of list) { r -= w; if (r <= 0) return runEvent(k); }
  return false;
}
// ---- action hooks
bus.on('player:step', () => { dir.lastStepT = clock.elapsedTime; dir.walkT += .5; });
bus.on('build:placed', pc => {
  dir.attention = clamp(dir.attention + .05, 0, 1);
  if (pc.def.wall && Math.random() < .22) later(rand(3, 8), () => { audio.knock(sidePos(rand(6, 12))); say(pick(H_TEXT.knockReply), 4); addPanic(.06); });
});
bus.on('build:removed', () => { dir.attention = clamp(dir.attention + .04, 0, 1); });
bus.on('chalk:drawn', () => { dir.attention = clamp(dir.attention + .02, 0, 1); if (Math.random() < .12) later(rand(20, 60), () => runEvent('chalk_moved')); });
bus.on('shelter:enter', () => { dir.attention = Math.max(0, dir.attention - .2); });
bus.on('door:toggle', pc => { if (Math.random() < .08) later(rand(2, 4), () => audio.creak(sidePos(rand(8, 14)))); });
bus.on('player:consume', e => { if (e.id === 'pills') dir.attention = Math.max(0, dir.attention - .15); });
function updateDirector(dt) {
  const t = clock.elapsedTime, st = player.st;
  for (let i = dir.pending.length - 1; i >= 0; i--) if (dir.pending[i].t <= t) { const p = dir.pending.splice(i, 1)[0]; try { p.fn(); } catch (e) { console.error(e); } }
  // attention: noise, darkness, sanity
  const dark = player.lightLevel < .08;
  dir.attention = clamp(dir.attention + dt * (player.noise * .02 + (dark ? .006 : -.004) + (st.sanity < 40 ? .004 : 0) - (player.inShelter ? .01 : 0)), 0, 1);
  // echo footsteps: stop after walking → steps behind continue
  dir.echoCd -= dt;
  if (dir.walkT > 6 && t - dir.lastStepT > .35 && t - dir.lastStepT < .5 && dir.echoCd < 0 && !player.swim) {
    const chance = .12 + (1 - st.sanity / 100) * .35 + dir.attention * .2;
    if (Math.random() < chance) { const p = behindPos(rand(5, 8), .4), d = camera.position.clone().sub(p).setY(0).normalize(); audio.phantomSteps(p, d, 2 + (Math.random() * 2 | 0), surfaceAt(p.x, p.z) === 'tile' ? 'tile' : 'carpet', 470); if (Math.random() < .5) later(1.4, () => say(pick(H_TEXT.echo), 4)); addPanic(.08); dir.echoCd = rand(40, 90); }
    else dir.echoCd = rand(8, 15);
    dir.walkT = 0;
  }
  if (t - dir.lastStepT > 2) dir.walkT = 0;
  // scheduler
  if (!player.sleeping && !player.dead) {
    dir.next -= dt * (1 + dir.attention * 1.5 + (1 - st.sanity / 100));
    if (dir.next <= 0) { dir.next = rand(...BAL.directorBase) / (1 + (WORLD.level - 1) * .15); if (Math.random() < .55 + dir.attention * .3) randomEvent(); }
  }
  // power
  if (dir.blackout > 0) { dir.blackout -= dt; dir.powerTarget = 0; if (dir.blackout <= 0) { audio.powerUp(); humEvent(.7, 3); for (const o of nearFixtures(14)) flickerFixture(o.f, rand(.5, 2)); } }
  else if (dir.brown > 0) { dir.brown -= dt; dir.powerTarget = .35 + .15 * Math.sin(t * 9); }
  else dir.powerTarget = 1;
  dir.powerTarget = Math.min(dir.powerTarget, CURFEW.power);
  POWER.value = damp(POWER.value, dir.powerTarget, CURFEW.blinks.length ? 28 : dir.powerTarget < POWER.value ? 6 : 2.5, dt);
  // hum: only during events + right next to stuttering fixtures
  dir.humT -= dt; if (dir.humT <= 0) dir.humTarget = 0;
  // гул: обычные лампы молчат. Гудят лишь некоторые («жужжалки», ~1 из 5) — и только если стоять почти под ними;
  // мигающие лампы трещат громче и слышны дальше. Остальное время — тишина.
  dir.humScan -= dt; if (dir.humScan <= 0) { dir.humScan = .25; let near = 0; const cp = camera.position;
    for (const c of chunks.values()) for (const e of c.fixtures) { const f = e.f, v = f._v ?? 0; if (v <= .01) continue; const flick = f.flicker || flickUntil.has(f.key); if (!flick && f.seed > .2) continue;
      const d = Math.hypot(f.x - cp.x, f.z - cp.z, f.y - cp.y), R = flick ? 7 : 2.8; if (d > R) continue; if (!losClear(cp.x, cp.z, f.x, f.z)) continue;
      near = Math.max(near, smooth(R, .9, d) * v * (flick ? .55 : .2 * (.35 + S.ambience * 1.3))); }
    dir.humNear = near; }
  if (dir.silence > 0) { dir.silence -= dt; dir.hum = damp(dir.hum, 0, 8, dt); }
  else dir.hum = damp(dir.hum, Math.max(dir.humTarget, dir.humNear || 0) * POWER.value, 3, dt);
  // долгое стояние в темноте → дыхание за спиной
  const still = t - dir.lastStepT > 4 && !player.sleeping && !player.swim;
  dir.darkStill = still && player.lightLevel < BAL.darkLevel ? (dir.darkStill || 0) + dt : 0;
  dir.breathCd -= dt;
  if (dir.darkStill > 22 && dir.breathCd <= 0) { dir.breathCd = rand(70, 120); dir.darkStill = 0; audio.breath(behindPos(.9, .3)); later(1.2, () => say(pick(['Дыхание. Совсем рядом. Ты стоишь слишком долго.', 'Кто-то дышит в такт с тобой.', 'Темнота дышит.']), 4)); addPanic(.1); }
  updateSilhouette(dt);
}
