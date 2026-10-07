// =====================================================================
//  SURVIVAL — hunger, thirst, energy, sanity, panic, health
// =====================================================================
const STAT_LABEL = { health: 'Здоровье', hunger: 'Сытость', thirst: 'Вода', energy: 'Бодрость', sanity: 'Рассудок' };
let lastWarn = {};
function warnOnce(id, text, every = 90) { const t = clock.elapsedTime; if ((lastWarn[id] ?? -1e9) + every < t) { lastWarn[id] = t; say(text); } }
function updateSurvival(dt) {
  const p = player, st = p.st; if (p.dead || p.sleeping) return;
  const sprint = Math.hypot(p.vel.x, p.vel.z) > 5.5, B = BAL, sk = sprint ? B.sprintDrain : 1;
  const RT = Mods.filter('survival:rates', { thirst: 1, hunger: 1, energy: 1, sanity: 1 }, st);
  st.thirst = Math.max(0, st.thirst - dt * (100 / (B.thirstMin * 60)) * sk * (p.swim ? .7 : 1) * RT.thirst);
  st.hunger = Math.max(0, st.hunger - dt * (100 / (B.hungerMin * 60)) * (sprint ? 1 + (sk - 1) * .7 : 1) * RT.hunger);
  st.energy = Math.max(0, st.energy - dt * (100 / (B.energyMin * 60)) * sk * RT.energy);
  // кислород
  if (p.under) { st.oxygen = Math.max(0, st.oxygen - dt / B.oxygenSec); if (st.oxygen < .3) st.panic = Math.min(1, st.panic + dt * .15); }
  else st.oxygen = Math.min(1, st.oxygen + dt / 3);
  // рассудок: темнота съедает, свет и убежище лечат
  const L = p.lightLevel, dark = L < B.darkLevel, dim = L < B.dimLevel;
  // свет лишь замедляет потерю; восстанавливает только если рассудок уже сильно просел
  let ds = dark ? B.sanityDark : dim ? B.sanityDim : st.sanity < B.sanityLitCap ? B.sanityLit : B.sanityLitHigh;
  if (dark && p.flash.on) ds *= .45; // фонарик — не убежище, но легче
  if (p.inShelter) ds += B.sanityShelter;
  if (st.hunger < 20) ds -= .06; if (st.thirst < 20) ds -= .08; if (st.energy < 25) ds -= .1 * (1 - st.energy / 25);
  ds += st.panic * B.sanityPanic;
  // на первых минутах уровня мир ещё «щадит»
  if (game.playT < B.graceSec && ds < 0) ds *= B.graceMul;
  st.sanity = clamp(st.sanity + (ds < 0 ? ds * RT.sanity : ds) * dt, 0, 100);
  Mods.emit('survival:update', { dt, st });
  st.panic = clamp(st.panic - dt * (dark ? .015 : p.inShelter ? .09 : .045) + (dark && st.sanity < 40 ? dt * .01 : 0), 0, 1);
  // здоровье
  let dh = 0;
  if (st.thirst <= 0) dh -= B.thirstDmg; if (st.hunger <= 0) dh -= B.starveDmg; if (st.oxygen <= 0) dh -= B.drownDmg;
  if (!dh && st.hunger > 40 && st.thirst > 40) dh = B.regenHealth * (p.inShelter ? 2 : 1);
  st.health = clamp(st.health + dh * dt, 0, 100);
  if (st.health <= 0) { die(st.oxygen <= 0 ? 'Ты захлебнулся в тёплой воде.' : 'Тело просто перестало идти.'); return; }
  if (st.thirst < 20) warnOnce('thirst', 'Во рту пересохло. Ищи воду — фонтанчики бывают у стен.');
  if (st.hunger < 20) warnOnce('hunger', 'Желудок сводит от голода. Обыщи столы и шкафы.');
  if (st.energy < 20) warnOnce('energy', 'Глаза слипаются. Нужно где-то поспать.');
  if (st.sanity < 30) warnOnce('sanity', 'Мысли путаются. Нужен свет. Нужно успокоиться.', 120);
  if (st.sanity < 8 && st.panic > .8) breakdown();
  p.noise = Math.max(0, p.noise - dt * .05);
}
function addPanic(v) { player.st.panic = clamp(player.st.panic + v, 0, 1); player.st.sanity = clamp(player.st.sanity - v * 6, 0, 100); }
function applyUse(u) {
  const st = player.st;
  for (const k in u) { if (k === 'panic') st.panic = clamp(st.panic + u[k], 0, 1); else st[k] = clamp(st[k] + u[k], 0, 100); }
}

