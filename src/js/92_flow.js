// =====================================================================
//  SLEEP / DEATH / BREAKDOWN / WIN
// =====================================================================
const fade = (v, sec = 1) => { const f = $('fade'); f.style.transition = `opacity ${sec}s`; f.style.opacity = v; };
function sleep(onBed) {
  const st = player.st;
  if (st.energy > 80) { say('Спать пока не хочется.', 2); return; }
  if (!onBed && st.energy > 50) { say('На полу не уснуть. Нужно сильнее устать — или лежанка.', 3); return; }
  updateShelter();
  const shelter = player.inShelter, lit = player.shelterInfo?.lit;
  player.sleeping = true; keysClear(); fade(1, 1.5); audio.cloth();
  setTimeout(() => {
    let hours = Math.round(lerp(3, 8, 1 - st.energy / 100)), woke = false, text;
    const risk = (shelter ? .08 : onBed ? .35 : .55) + dir.attention * .3 - (lit ? .1 : 0);
    if (Math.random() < risk) { woke = true; hours = Math.max(1, hours >> 1); }
    const k = hours / 8;
    st.energy = clamp(st.energy + (onBed ? 95 : 55) * k * (woke ? .7 : 1), 0, 100);
    st.hunger = clamp(st.hunger - 14 * k, 0, 100); st.thirst = clamp(st.thirst - 20 * k, 0, 100);
    st.sanity = clamp(st.sanity + (shelter ? 30 : lit ? 8 : -12) * (woke ? .4 : 1), 0, 100); st.panic = woke ? .35 : 0; st.stamina = 1;
    if (st.health < 100) st.health = clamp(st.health + 15 * k, 0, 100);
    game.hours += hours; dir.attention = woke ? .5 : .1; dir.next = rand(30, 60);
    // the world shifts while you sleep
    if (Math.random() < .5) runEvent('geometry_shift');
    text = woke ? `Ты проспал около ${hours} ч и проснулся от стука. Совсем рядом.` : shelter ? `Ты проспал около ${hours} ч. Свет не гас. Впервые за долгое время — без снов.` : lit ? `Ты проспал около ${hours} ч. Снились жёлтые коридоры.` : `Ты проспал около ${hours} ч в темноте. Кажется, кто-то стоял рядом и смотрел.`;
    if (woke) later(.5, () => audio.knock(sidePos(rand(3, 6))));
    saveGame(true);
    setTimeout(() => { player.sleeping = false; fade(0, 2.5); say(text, 7); }, 1200);
  }, 1600);
}
function die(text) {
  if (player.dead) return; player.dead = true; fade(1, 3); audio.heartbeat(1);
  setTimeout(() => openDialog('ТЫ НЕ ВЫБРАЛСЯ', `<p>${text}</p><p style="color:#9c9374">Уровень ${game.level} · записок: ${game.notes.length}</p>`,
    [...(hasSave() ? [['ЗАГРУЗИТЬ СОХРАНЕНИЕ', () => { closeDialog(); loadGame(); }]] : []), ['НОВАЯ ИГРА', () => { closeDialog(); newGame(); }]], false), 2500);
}
function findFreeSpot(cx, cz, rad) {
  for (let i = 0; i < 40; i++) {
    const gx = Math.floor(cx / CELL) + Math.round(rand(-rad, rad)), gz = Math.floor(cz / CELL) + Math.round(rand(-rad, rad));
    if (isPool(gx, gz) || isExitCell(gx, gz)) continue;
    const x = gx * CELL + rand(1, 3), z = gz * CELL + rand(1, 3);
    if (!chunks.has(Math.floor(x / CS) + ',' + Math.floor(z / CS))) continue;
    if (world.intersectionWithShape({ x, y: CENTER + .2, z }, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(CAP_HH, CAP_R + .08), undefined, undefined, player.col)) continue;
    const hit = world.castRay(new RAPIER.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 }), 3, true, undefined, undefined, player.col);
    if (hit && Math.abs(2 - hit.timeOfImpact) < .3) return V3(x, 2 - hit.timeOfImpact, z);
  }
  return null;
}
let breakdownLock = 0;
function breakdown() {
  if (breakdownLock > clock.elapsedTime) return; breakdownLock = clock.elapsedTime + 60;
  player.sleeping = true; keysClear(); fade(1, .4); audio.heartbeat(1.2); audio.whisper(null);
  setTimeout(() => {
    const fp = feetPos(); const spot = findFreeSpot(fp.x, fp.z, 7);
    const loseable = inv.slots.map((s, i) => s ? i : -1).filter(i => i >= 0);
    let lost = '';
    if (loseable.length && Math.random() < .7) { const i = pick(loseable); lost = ITEMS[inv.slots[i].id].name; const id = inv.takeSlot(i); spawnItem(id, fp.clone().add(V3(0, .4, 0))); }
    if (spot) teleport(spot.x, spot.y, spot.z);
    const st = player.st; st.sanity = 30; st.panic = .25; st.energy = clamp(st.energy - 10, 0, 100);
    setTimeout(() => { player.sleeping = false; fade(0, 3); say('Ты не помнишь последние минуты. Ты где-то в другом месте.' + (lost ? ` Пропало: ${lost}.` : ''), 7); }, 1500);
  }, 900);
}
function winLevel() {
  const known = !!game.levels?.[game.level + 1];
  if (known) { player.sleeping = true; keysClear(); fade(1, .9); audio.creak(WORLD.exitDoor); setTimeout(() => { player.sleeping = false; nextLevel(); }, 1000); return; }
  audio.creak(WORLD.exitDoor); fade(1, 2); player.sleeping = true; keysClear();
  const base = [...pieces].filter(p => p.def.wall).length;
  setTimeout(() => openDialog('ВЫХОД', `<p>Дверь поддаётся. За ней — узкая лестница вниз и запах озона.</p><p>Внизу тихо. Так тихо, что слышно, как гудит кровь в ушах. Снова жёлтые обои — но здесь всё немного иначе и немного темнее.</p>${base ? '<p>Твоя база останется здесь. Дверь «НАВЕРХ» внизу, у лестницы, приведёт обратно.</p>' : '<p>Дверь «НАВЕРХ» внизу, у лестницы, приведёт обратно — если захочешь вернуться.</p>'}<p style="color:#9c9374">Уровень ${game.level} пройден за ${Math.round(game.playT / 60)} мин игрового времени.</p>`,
    [['СПУСТИТЬСЯ', () => { closeDialog(); player.sleeping = false; Mods.emit('level:exit', { level: game.level }); nextLevel(); }], ['ОСТАТЬСЯ', () => { closeDialog(); player.sleeping = false; fade(0, 1.2); resume(); }]], false, false), 2000);
}


// настоящий выход (из модов: api.escape(text)) — концовка и «Новая игра+»
function escapeEnding(text, mod = 'core') {
  if (player.dead || game.escaped) return; game.escaped = true; Mods.emit('game:escape', { mod, level: game.level });
  player.sleeping = true; keysClear(); fade(1, 4); audio.powerDown();
  const t = fmtTime(game.playT + game.hours * 0);
  setTimeout(() => openDialog('НАРУЖУ', `<p>${text || 'Гул обрывается на полуслове. Ты чувствуешь холод — настоящий, уличный. Пахнет дождём и асфальтом.'}</p>
    <p>Ты стоишь на парковке за торговым центром. Светает. Где-то за спиной, в пустой витрине, на секунду загорается жёлтая лампа — и гаснет.</p>
    <p class="d">Уровней пройдено: ${game.level} · записей в журнале: ${game.journal.length} · заданий: ${Quests.done.size} · время на уровне: ${t}</p>
    <p class="d">«Новая игра+» начинается с первого уровня: журнал и руководства сохраняются, мир — новый и чуть темнее.</p>`,
    [['НОВАЯ ИГРА+', () => { closeDialog(); const j = game.journal.slice(), ng = (game.ng || 0) + 1; newGame(); game.journal = j; game.ng = ng; BAL.levelDark = .06 + ng * .02; say(`Новая игра+ (${ng}). Ты снова здесь. Ты помнишь, что отсюда есть выход.`, 6); }], ['В МЕНЮ', () => { closeDialog(); game.escaped = false; player.sleeping = false; openMenu(); }]], false, false), 4200);
}
