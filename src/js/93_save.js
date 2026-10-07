// =====================================================================
//  SAVE SYSTEM — localStorage + export/import + optional folder
// =====================================================================
const SAVE_KEY = 'backrooms.save.v2';
let dirHandle = null;
const hasSave = () => !!localStorage.getItem(SAVE_KEY);
// ---- состояние ОДНОГО уровня: постройки, разобранное, мел, предметы на полу. Уровни хранятся все —
// база не исчезает при спуске, к ней можно вернуться через дверь «НАВЕРХ».
const serPieces = () => [...pieces].map(p => { const o = { id: p.def.id, p: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, open: p.open }; if (p.light) o.on = p.light.on; if (p.machine) o.m = p.machine.state; if (p.def.dynamic) { const t = p.body.translation(), r = p.body.rotation(); o.bt = [t.x, t.y, t.z]; o.br = [r.x, r.y, r.z, r.w]; } return o; });
function levelSnapshot() {
  return {
    seed: game.seed, notes: game.notes.slice(), playT: game.playT, visits: (game.visits || 0),
    picked: [...pickedKeys], variants: [...variants], dead: [...deadFixtures], wobj: WorldObj.serialize(),
    pieces: serPieces(), chalk: chalkMarks.map(m => ({ x: m.x, y: m.y, z: m.z, nx: m.nx, ny: m.ny, nz: m.nz, yaw: m.yaw })), salvaged: [...salvaged],
    items: [...worldItems].filter(it => !it.key).map(it => { const t = it.body.translation(); return { id: it.id, p: [t.x, t.y, t.z] }; }),
    curfew: CURFEW.save(), leftAt: game.hours * 3600 + game.totalT,
  };
}
// восстановить уровень из снимка (мир уже очищен). Позицию игрока ставит вызывающий.
function applyLevel(lv, L, px, pz) {
  game.seed = L.seed; game.level = lv; game.notes = (L.notes || []).map(noteId); game.playT = L.playT || 0; game.visits = L.visits || 0;
  initWorldGen(L.seed, lv);
  WorldObj.restore(L.wobj);
  for (const k of L.picked || []) pickedKeys.add(k);
  for (const [k, v] of L.variants || []) variants.set(k, v);
  for (const k of L.dead || []) deadFixtures.add(k);
  for (const k of L.salvaged || []) salvaged.add(k);
  for (const p of L.pieces || []) {
    if (!BUILD_BY_ID[p.id]) continue;
    const pc = createPiece(p.id, V3(...p.p), p.yaw, { open: p.open, m: p.m, noRebake: true, ...(p.bt ? { p: { x: p.bt[0], y: p.bt[1], z: p.bt[2] }, rot: { x: p.br[0], y: p.br[1], z: p.br[2], w: p.br[3] } } : {}) });
    if (pc && pc.light && p.on === false) pc.light.on = false;
  }
  prebuild(px, pz);
  for (const m of L.chalk || []) addChalkMark(m, true);
  for (const it of L.items || []) if (ITEMS[it.id]) spawnItem(it.id, V3(...it.p));
  CURFEW.load(L.curfew);
}
function serialize() {
  const tr = player.body.translation();
  return {
    v: 4, at: Date.now(), level: game.level, hours: game.hours, journal: game.journal, ng: game.ng || 0, maxLevel: game.maxLevel || game.level, totalT: game.totalT || 0,
    ...levelSnapshot(),
    player: { x: tr.x, y: tr.y - CENTER, z: tr.z, yaw: player.yaw, pitch: player.pitch, st: { ...player.st, panic: 0 }, flash: { ...player.flash } },
    inv: inv.slots, bag: inv.bag, sel: inv.sel, chalkUses,
    mods: Mods.saveData(), quests: Quests.save(), levels: game.levels || {}, horror: Horror.save(),
  };
}
async function writeFolder(json) {
  if (!dirHandle) return;
  try { const fh = await dirHandle.getFileHandle('backrooms_save.json', { create: true }); const w = await fh.createWritable(); await w.write(json); await w.close(); } catch (e) { console.warn('folder save failed', e); }
}
function saveGame(silent = false) {
  if (!game.started || player.dead) return false;
  try { const json = JSON.stringify(serialize()); localStorage.setItem(SAVE_KEY, json); writeFolder(json); if (!silent) say('Игра сохранена.', 2); showSaved(); updateMenuInfo(); return true; }
  catch (e) { console.error(e); say('Не удалось сохранить.', 3); return false; }
}
function resetWorldState() {
  clearWorld();
  for (const p of [...pieces]) removePieceObj(p);
  for (const m of [...chalkMarks]) removeChalk(m);
  pickedKeys.clear(); salvaged.clear(); variants.clear(); deadFixtures.clear(); tempOff.clear(); switchOff.clear(); flickUntil.clear(); WorldObj.clear();
  dir.pending.length = 0; Watcher.reset(); dir.blackout = 0; dir.brown = 0; POWER.value = 1; dir.attention = .1; dir.next = 25; hall.list.length = 0;
  if (build.on) setBuildMode(false);
  Shadow.reset(); Spiders.clear(); Horror.clearWorld(); U.crawl.value = 0;
}
function prebuild(x, z) { chunkUpdate(x, z, 50); flushBake(); try { renderer.compile(scene, camera); } catch (e) {} }
function resetPlayer() {
  Object.assign(player.st, { health: 100, hunger: 85, thirst: 80, energy: 90, sanity: 85, panic: 0, oxygen: 1, stamina: 1 }); ModStats.reset();
  player.flash.on = false; player.flash.battery = 1; player.dead = false; player.sleeping = false; player.noise = 0;
}
function startInventory() {
  inv.slots = new Array(INV_BASE).fill(null); inv.bag = 0; inv.sel = 0; chalkUses = 12;
  inv.add('water', 1); inv.add('bar', 1); inv.add('almond', 1); inv.add('battery', 1); inv.add('chalk', 1); inv.add('panel', 2); inv.add('plank', 2);
}
function beginPlay(msg) {
  game.started = true; game.autoT = 45; fade(0, 2.5); $('hud').classList.remove('hidden');
  renderHotbar(); renderObjectives.last = ''; if (msg) setTimeout(() => say(msg, 7), 800);
  updateMenuInfo(); resume();
}
function newGame(seed = (Math.random() * 1e9) | 0) {
  resetWorldState(); game.seed = seed; game.level = 1; game.notes = []; game.journal = []; game.ng = 0; game.escaped = false; BAL.levelDark = .06; game.hours = 0; game.playT = 0;
  game.levels = {}; game.maxLevel = 1; game.visits = 1; game.totalT = 0; Horror.reset(); CURFEW.reset();
  initWorldGen(seed, 1); resetPlayer(); startInventory(); Quests.reset(); Mods.resetData(); Mods.emit('world:new', { seed, level: 1 }); player.yaw = Math.PI * .75; player.pitch = 0;
  prebuild(2, 2); teleport(2, 0, 2);
  beginPlay('Ты не помнишь, как оказался здесь. Пахнет сырым ковролином. Где-то должен быть выход.');
  setTimeout(() => saveGame(true), 3000);
}
// ---- переход между уровнями: текущий уровень «замораживается» в game.levels, целевой — восстанавливается или создаётся
function travel(lv, arrive) {
  const keepInv = inv.slots.map(s => s && { ...s }), st = { ...player.st }, from = game.level, fresh = !game.levels[lv];
  Mods.emit('level:leave', { level: from, to: lv });
  game.levels[from] = levelSnapshot();
  resetWorldState();
  if (!fresh) {
    const L = game.levels[lv]; delete game.levels[lv]; const away = game.hours * 3600 + (game.totalT || 0) - (L.leftAt || 0);
    const spot = arrive === 'up' ? exitSpotOf(L.seed, lv) : { x: 2, z: 2 };
    applyLevel(lv, L, spot.x, spot.z); Mods.emit('level:restore', { level: lv, from });
    teleport(spot.x, 0, spot.z); player.yaw = arrive === 'up' ? Math.PI : Math.PI * .75; Horror.onReturn(away);
  } else {
    game.seed = (Math.random() * 1e9) | 0; game.level = lv; game.notes = []; game.playT = 0; game.visits = 0;
    initWorldGen(game.seed, lv); CURFEW.load(null); Mods.emit('world:new', { seed: game.seed, level: lv });
    prebuild(2, 2); teleport(2, 0, 2); player.yaw = Math.PI * .75;
  }
  player.pitch = 0; game.visits = (game.visits || 0) + 1;
  player.dead = false; player.sleeping = false;
  const deeper = lv > (game.maxLevel || 1); game.maxLevel = Math.max(game.maxLevel || 1, lv);
  Object.assign(player.st, st, { sanity: clamp(st.sanity + (deeper ? 20 : 0), 0, 100), panic: 0 });
  inv.slots = keepInv; inv.fit(); bus.emit('inventory:changed');
  Mods.emit('level:enter', { level: lv, from, fresh, arrive });
  const base = [...pieces].filter(p => p.def.wall).length;
  beginPlay(arrive === 'up' ? `Уровень ${lv}. Ты вернулся. ${base ? 'Твои стены стоят там, где ты их оставил.' : 'Здесь всё так, как ты оставил.'}` :
    fresh ? `Уровень ${lv}. Те же стены. Другие коридоры. Здесь темнее.` : `Уровень ${lv}. Ты здесь уже был. ${base ? 'Твоя база ждёт.' : ''}`);
  setTimeout(() => saveGame(true), 2000);
}
// точка перед дверью «ВЫХОД» уровня (без генерации чанков — только по сиду)
function exitSpotOf(seed, lv) { const s0 = SEED, w0 = { ...WORLD }; initWorldGen(seed, lv); const r = { x: WORLD.exitX, z: WORLD.exitZ }; SEED = s0; Object.assign(WORLD, w0); return r; }
function nextLevel() { travel(game.level + 1, 'down'); }
function prevLevel() {
  if (game.level <= 1) return;
  player.sleeping = true; keysClear(); fade(1, .9); audio.creak(WORLD.upDoor); audio.latch(WORLD.upDoor);
  setTimeout(() => { player.sleeping = false; travel(game.level - 1, 'up'); }, 1000);
}
function loadGame(data = null) {
  try { data = data || JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  if (!data || ![2, 3, 4].includes(data.v)) { say('Сохранение не найдено.', 3); return false; }
  resetWorldState();
  game.journal = [...new Set((data.journal || data.notes || []).map(noteId))]; game.hours = data.hours || 0; game.ng = data.ng || 0; game.escaped = false;
  game.levels = data.levels || {}; game.maxLevel = data.maxLevel || data.level || 1; game.totalT = data.totalT || 0;
  resetPlayer(); ModStats.reset(); Object.assign(player.st, data.player.st); Object.assign(player.flash, data.player.flash);
  inv.bag = data.bag || 0; inv.slots = (data.inv || []).map(s => s && ITEMS[s.id] ? { id: s.id, n: s.n } : null); while (inv.slots.length < inv.capacity()) inv.slots.push(null);
  const extra = inv.slots.splice(inv.capacity());
  inv.sel = data.sel || 0; chalkUses = data.chalkUses || 12;
  const P = data.player;
  applyLevel(data.level || 1, data, P.x, P.z);
  Quests.load(data.quests); Mods.loadData(data.mods || {}); Horror.load(data.horror);
  teleport(P.x, P.y, P.z); player.yaw = P.yaw; player.pitch = P.pitch || 0;
  for (const s of extra) if (s) { const left = inv.add(s.id, s.n); if (left) dropStack(s.id, left); }
  bus.emit('inventory:changed');
  Mods.emit('game:load', data);
  beginPlay('Ты снова здесь.');
  return true;
}
function exportSave() {
  if (game.started) saveGame(true);
  const json = localStorage.getItem(SAVE_KEY); if (!json) { alert('Нет сохранения для экспорта.'); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `backrooms_save_L${game.level || 1}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('fileImport').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const data = JSON.parse(await f.text()); if (![2, 3, 4].includes(data.v)) throw 0; localStorage.setItem(SAVE_KEY, JSON.stringify(data)); startAudio(); loadGame(data); } catch (err) { alert('Файл сохранения не подходит.'); }
  e.target.value = '';
};
async function pickFolder() {
  try {
    dirHandle = await showDirectoryPicker({ mode: 'readwrite' });
    try { const fh = await dirHandle.getFileHandle('backrooms_save.json'); const txt = await (await fh.getFile()).text(); const data = JSON.parse(txt);
      if ([2, 3, 4].includes(data.v) && (!hasSave() || confirm('В папке есть сохранение. Загрузить его?'))) { localStorage.setItem(SAVE_KEY, txt); updateMenuInfo(); } } catch (e) {}
    $('btnFolder').textContent = 'ПАПКА: ' + dirHandle.name.toUpperCase(); if (game.started) saveGame(true);
  } catch (e) {}
}
function updateMenuInfo() {
  let txt = 'Сохранений нет.';
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d) txt = `Сохранение: уровень ${d.level}, записок ${(d.notes || []).length}/${BAL.notesNeeded} · ${new Date(d.at).toLocaleString('ru-RU')}${dirHandle ? ' · дублируется в папку' : ''}`; } catch (e) {}
  $('saveinfo').textContent = txt; $('btnContinue').classList.toggle('hidden', !hasSave() && !game.started);
  $('btnContinue').textContent = game.started ? 'ПРОДОЛЖИТЬ ИГРУ' : 'ПРОДОЛЖИТЬ С СОХРАНЕНИЯ';
  $('btnSave').classList.toggle('hidden', !game.started); $('btnLoad').classList.toggle('hidden', !game.started || !hasSave());
  $('playtitle').textContent = game.started ? `ПАУЗА · УРОВЕНЬ ${game.level}` : 'ИГРА';
}
addEventListener('beforeunload', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });

