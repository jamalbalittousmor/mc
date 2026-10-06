// =====================================================================
//  SAVE SYSTEM — localStorage + export/import + optional folder
// =====================================================================
const SAVE_KEY = 'backrooms.save.v2';
let dirHandle = null;
const hasSave = () => !!localStorage.getItem(SAVE_KEY);
function serialize() {
  const tr = player.body.translation();
  return {
    v: 3, at: Date.now(), seed: game.seed, level: game.level, hours: game.hours, playT: game.playT, notes: game.notes, journal: game.journal,
    player: { x: tr.x, y: tr.y - CENTER, z: tr.z, yaw: player.yaw, pitch: player.pitch, st: { ...player.st, panic: 0 }, flash: { ...player.flash } },
    inv: inv.slots, sel: inv.sel, chalkUses,
    picked: [...pickedKeys], variants: [...variants], dead: [...deadFixtures], wobj: WorldObj.serialize(),
    pieces: [...pieces].map(p => { const o = { id: p.def.id, p: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, open: p.open }; if (p.light) o.on = p.light.on; if (p.machine) o.m = p.machine.state; if (p.def.dynamic) { const t = p.body.translation(), r = p.body.rotation(); o.bt = [t.x, t.y, t.z]; o.br = [r.x, r.y, r.z, r.w]; } return o; }),
    chalk: chalkMarks.map(m => ({ x: m.x, y: m.y, z: m.z, nx: m.nx, ny: m.ny, nz: m.nz, yaw: m.yaw })),
    mods: Mods.saveData(), quests: Quests.save(), salvaged: [...salvaged],
    items: [...worldItems].filter(it => !it.key).map(it => { const t = it.body.translation(); return { id: it.id, p: [t.x, t.y, t.z] }; }),
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
}
function prebuild(x, z) { chunkUpdate(x, z, 50); flushBake(); try { renderer.compile(scene, camera); } catch (e) {} }
function resetPlayer() {
  Object.assign(player.st, { health: 100, hunger: 85, thirst: 80, energy: 90, sanity: 85, panic: 0, oxygen: 1, stamina: 1 }); ModStats.reset();
  player.flash.on = false; player.flash.battery = 1; player.dead = false; player.sleeping = false; player.noise = 0;
}
function startInventory() {
  inv.slots.fill(null); inv.sel = 0; chalkUses = 12;
  inv.add('water', 1); inv.add('bar', 1); inv.add('almond', 1); inv.add('battery', 1); inv.add('chalk', 1); inv.add('panel', 2); inv.add('plank', 2);
}
function beginPlay(msg) {
  game.started = true; game.autoT = 45; fade(0, 2.5); $('hud').classList.remove('hidden');
  renderHotbar(); renderObjectives.last = ''; if (msg) setTimeout(() => say(msg, 7), 800);
  updateMenuInfo(); resume();
}
function newGame(seed = (Math.random() * 1e9) | 0) {
  resetWorldState(); game.seed = seed; game.level = 1; game.notes = []; game.journal = []; game.hours = 0; game.playT = 0;
  initWorldGen(seed, 1); resetPlayer(); startInventory(); Quests.reset(); Mods.resetData(); Mods.emit('world:new', { seed, level: 1 }); player.yaw = Math.PI * .75; player.pitch = 0;
  prebuild(2, 2); teleport(2, 0, 2);
  beginPlay('Ты не помнишь, как оказался здесь. Пахнет сырым ковролином. Где-то должен быть выход.');
  setTimeout(() => saveGame(true), 3000);
}
function nextLevel() {
  const keepInv = inv.slots.map(s => s && { ...s }), keepJ = game.journal.slice(), lv = game.level + 1, st = { ...player.st };
  resetWorldState(); game.seed = (Math.random() * 1e9) | 0; game.level = lv; game.notes = []; game.journal = keepJ;
  initWorldGen(game.seed, lv); player.dead = false; player.sleeping = false; Mods.emit('world:new', { seed: game.seed, level: lv });
  Object.assign(player.st, st, { sanity: clamp(st.sanity + 20, 0, 100), panic: 0 });
  inv.slots = keepInv; bus.emit('inventory:changed');
  prebuild(2, 2); teleport(2, 0, 2);
  beginPlay(`Уровень ${lv}. Те же стены. Другие коридоры.`);
  setTimeout(() => saveGame(true), 2000);
}
function loadGame(data = null) {
  try { data = data || JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  if (!data || (data.v !== 2 && data.v !== 3)) { say('Сохранение не найдено.', 3); return false; }
  resetWorldState();
  game.seed = data.seed; game.level = data.level || 1; game.notes = data.notes || []; game.journal = data.journal || game.notes.slice(); game.hours = data.hours || 0; game.playT = data.playT || 0;
  initWorldGen(data.seed, game.level);
  WorldObj.restore(data.wobj);
  for (const k of data.picked || []) pickedKeys.add(k);
  for (const [k, v] of data.variants || []) variants.set(k, v);
  for (const k of data.dead || []) deadFixtures.add(k);
  resetPlayer(); ModStats.reset(); Object.assign(player.st, data.player.st); Object.assign(player.flash, data.player.flash);
  inv.slots = (data.inv || []).map(s => s && ITEMS[s.id] ? { id: s.id, n: s.n } : null); while (inv.slots.length < 24) inv.slots.push(null);
  inv.sel = data.sel || 0; chalkUses = data.chalkUses || 12;
  const P = data.player; prebuild(P.x, P.z);
  for (const p of data.pieces || []) {
    if (!BUILD_BY_ID[p.id]) continue;
    const pc = createPiece(p.id, V3(...p.p), p.yaw, { open: p.open, m: p.m, ...(p.bt ? { p: { x: p.bt[0], y: p.bt[1], z: p.bt[2] }, rot: { x: p.br[0], y: p.br[1], z: p.br[2], w: p.br[3] } } : {}) });
    if (pc && pc.light && p.on === false) pc.light.on = false;
  }
  for (const m of data.chalk || []) addChalkMark(m, true);
  for (const k of data.salvaged || []) salvaged.add(k);
  Quests.load(data.quests); Mods.loadData(data.mods || {});
  for (const it of data.items || []) if (ITEMS[it.id]) spawnItem(it.id, V3(...it.p));
  teleport(P.x, P.y, P.z); player.yaw = P.yaw; player.pitch = P.pitch || 0;
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
  try { const data = JSON.parse(await f.text()); if (data.v !== 2 && data.v !== 3) throw 0; localStorage.setItem(SAVE_KEY, JSON.stringify(data)); startAudio(); loadGame(data); } catch (err) { alert('Файл сохранения не подходит.'); }
  e.target.value = '';
};
async function pickFolder() {
  try {
    dirHandle = await showDirectoryPicker({ mode: 'readwrite' });
    try { const fh = await dirHandle.getFileHandle('backrooms_save.json'); const txt = await (await fh.getFile()).text(); const data = JSON.parse(txt);
      if ((data.v === 2 || data.v === 3) && (!hasSave() || confirm('В папке есть сохранение. Загрузить его?'))) { localStorage.setItem(SAVE_KEY, txt); updateMenuInfo(); } } catch (e) {}
    $('btnFolder').textContent = 'ПАПКА: ' + dirHandle.name.toUpperCase(); if (game.started) saveGame(true);
  } catch (e) {}
}
function updateMenuInfo() {
  let txt = 'Сохранений нет.';
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); if (d) txt = `Сохранение: уровень ${d.level}, записок ${d.notes.length}/${BAL.notesNeeded} · ${new Date(d.at).toLocaleString('ru-RU')}${dirHandle ? ' · дублируется в папку' : ''}`; } catch (e) {}
  $('saveinfo').textContent = txt; $('btnContinue').classList.toggle('hidden', !hasSave() && !game.started);
  $('btnContinue').textContent = game.started ? 'ВЕРНУТЬСЯ' : 'ПРОДОЛЖИТЬ';
}
addEventListener('beforeunload', () => saveGame(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(true); });

