// =====================================================================
//  INTERACTION
// =====================================================================
// предмет, на который смотрит игрок: конус вокруг луча взгляда (крошечные коллайдеры
// больше не нужно «выцеливать»), не дальше первой стены
function lookItem(maxD, h) {
  const o = camera.getWorldPosition(V3()), d = camera.getWorldDirection(V3()), lim = Math.min(maxD, h ? h.dist + .3 : maxD);
  let best = null, bs = 1e9; const v = V3();
  for (const it of worldItems) {
    if (!it.mesh.visible) continue; v.copy(it.mesh.position).sub(o); const t = v.dot(d); if (t < .15 || t > lim) continue;
    const perp = v.addScaledVector(d, -t).length(), tol = Math.max(.22, t * .1); if (perp > tol) continue;
    const sc = perp / tol + t * .12; if (sc < bs) { bs = sc; best = it; best._d = t; }
  }
  return best;
}
const itemTarget = it => ({ kind: 'item', it, text: it.id === 'note' ? 'E — прочитать записку' : `E — подобрать: ${ITEMS[it.id].name}` });
function interactTarget() {
  const h = camRay(2.6);
  const hit = h && itemByCollider.get(h.collider.handle); if (hit) return itemTarget(hit);
  const li = lookItem(2.6, h); if (li) return itemTarget(li);
  if (!h) return null;
  const pc = placed.get(h.collider.handle);
  if (pc && pc.machine) { const r = Machines.prompt(pc); if (r) return { kind: 'mod', ...r }; }
  for (const e of Interactions.sorted()) { let r = null; try { r = e.def.test(h, Mods.api(e.mod)); } catch (err) { console.error(err); } if (r) return { kind: 'mod', ...r }; }
  { const w = WorldObj.target(h); if (w) return w; }
  if (pc) {
    if (pc.def.door) return { kind: 'door', pc, text: pc.open ? 'E — закрыть дверь' : 'E — открыть дверь' };
    if (pc.def.bed) return { kind: 'bed', pc, text: 'E — лечь спать' };
    if (pc.light) return { kind: 'lamp', pc, text: pc.light.on ? 'E — выключить торшер' : 'E — включить торшер' };
  }
  if (WORLD.exitDoor && h.point.distanceTo(WORLD.exitDoor) < 1.6) return { kind: 'exit', text: 'E — открыть дверь «ВЫХОД»' };
  return null;
}
// удержание E: цели с полем hold (секунды) и holdKey выполняются после полоски прогресса
const HOLD = { tg: null, t: 0 };
function interact() {
  const tg = interactTarget(); if (!tg) return;
  if (tg.hold) { HOLD.tg = tg; HOLD.t = 0; $('holdbar').style.display = 'block'; tg.onHoldStart?.(); return; }
  if (tg.kind === 'item') pickup(tg.it);
  else if (tg.kind === 'door') toggleDoor(tg.pc);
  else if (tg.kind === 'bed') sleep(true);
  else if (tg.kind === 'lamp') { tg.pc.light.on = !tg.pc.light.on; audio.click(); }
  else if (tg.kind === 'exit') winLevel();
  else if (tg.kind === 'mod' || tg.kind === 'wobj') tg.run();
}
function cancelHold() { if (!HOLD.tg) return; HOLD.tg.onHoldCancel?.(); HOLD.tg = null; $('holdbar').style.display = 'none'; }
function updateHold(dt) {
  if (!HOLD.tg) return;
  if (game.state !== 'play' || !keys.KeyE) { cancelHold(); return; }
  const cur = interactTarget(); if (!cur || cur.holdKey !== HOLD.tg.holdKey) { cancelHold(); return; }
  HOLD.t += dt; HOLD.tg.onHoldTick?.(dt, HOLD.t);
  $('holdbar').firstChild.style.width = Math.min(100, HOLD.t / HOLD.tg.hold * 100) + '%';
  if (HOLD.t >= HOLD.tg.hold) { const tg = HOLD.tg; HOLD.tg = null; $('holdbar').style.display = 'none'; tg.run(); }
}
// подсветка предмета под прицелом — мягкий контур
const HL = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffe6a0, side: THREE.BackSide, transparent: true, opacity: .35, depthWrite: false })), it: null };
HL.mesh.userData.noAO = true; HL.mesh.visible = false; scene.add(HL.mesh);
function setHighlight(it) { HL.it = it && worldItems.has(it) ? it : null; if (HL.it) HL.mesh.geometry = HL.it.mesh.geometry; HL.mesh.visible = !!HL.it; }
function updateHighlight(t) {
  if (!HL.it) return; if (!worldItems.has(HL.it) || !HL.it.mesh.visible) { setHighlight(null); return; }
  const m = HL.it.mesh; HL.mesh.position.copy(m.position); HL.mesh.quaternion.copy(m.quaternion); HL.mesh.scale.copy(m.scale).multiplyScalar(1.18); HL.mesh.material.opacity = .22 + .12 * Math.sin(t * 5);
}
function pickup(it) {
  if (it.id === 'note') {
    if (it.key) pickedKeys.add(it.key); removeItem(it); audio.pickup();
    const d = nextLoreNote(); unlockNote(d.id, true); game.notes.push(d.id);
    const n = game.notes.length;
    openDialog(d.t, `<p>${d.b}</p>` + (n === BAL.notesNeeded ? '<p class="exit" style="color:#9fe8a0">На обороте — схема и стрелка. Теперь ты знаешь, куда идти.</p>' : n < BAL.notesNeeded ? `<p style="color:#9c9374">На обороте карандашом — часть схемы (${n}/${BAL.notesNeeded}).</p>` : '') + '<p class="d">Записка добавлена в журнал (J).</p>', [['ДАЛЬШЕ', closeDialog]]);
    player.st.sanity = clamp(player.st.sanity + 6, 0, 100); bus.emit('note:read', d.id); return;
  }
  const left = inv.add(it.id, 1); if (left) { say('Некуда положить.', 2); return; }
  Mods.emit('item:pickup', { id: it.id, key: it.key });
  if (it.key) pickedKeys.add(it.key); removeItem(it); audio.pickup(); player.noise += .02;
  pickupToast(it.id, 1); setHighlight(null);
}
// записка как находка (ящики, события): сразу в журнал, без счёта к схеме выхода
function giveNote(id) {
  const d = id ? NOTE_DEFS.get(noteId(id)) : nextLoreNote(); if (!d) return false;
  const fresh = unlockNote(d.id, true);
  openDialog(d.t, `<p>${d.b}</p><p class="d">${fresh ? 'Записка добавлена в журнал (J).' : 'Такую ты уже читал.'}</p>`, [['ДАЛЬШЕ', closeDialog]]);
  return true;
}
// ---------------- dialogs
let dialogOpen = false, dialogResume = true, dialogEsc = true;
// resume=false — окно поверх меню или обязательное (смерть/выход); esc=false — Esc не закрывает
function openDialog(title, html, buttons, resume = true, esc = resume || !$('menu').classList.contains('hidden')) {
  dialogEsc = esc;
  $('dtitle').textContent = title; $('dtext').innerHTML = html; const b = $('dbtns'); b.innerHTML = '';
  for (const [label, fn] of buttons) { const e = document.createElement('button'); e.textContent = label; e.onclick = () => fn(); b.appendChild(e); }
  $('dialog').classList.remove('hidden'); dialogOpen = true; dialogResume = resume; game.state = 'dialog'; document.exitPointerLock?.();
}
function closeDialog() { $('dialog').classList.add('hidden'); dialogOpen = false; if (dialogResume) resume(); else if (!$('menu').classList.contains('hidden')) game.state = game.started ? 'menu' : game.state; }
let jTab = 'notes';
const fmtTime = sec => { const m = Math.floor(sec / 60), h = Math.floor(m / 60); return h ? `${h} ч ${m % 60} мин` : `${m} мин`; };
function renderJournal() {
  document.querySelectorAll('#jtabs button').forEach(b => b.classList.toggle('on', b.dataset.jt === jTab));
  const have = new Set(game.journal), all = [...NOTE_DEFS.values()].sort((a, b) => a.order - b.order);
  const card = d => `<div class="note ${d.kind}"><b>${esc(d.t)}</b><div>${d.b}</div></div>`;
  let html = '';
  if (jTab === 'notes') {
    const lore = all.filter(d => d.kind !== 'guide'), got = lore.filter(d => have.has(d.id));
    html += `<p class="d">Найдено записей: ${got.length} из ${lore.filter(d => !d.hidden).length}. Записки лежат на полу, в ящиках столов и шкафах.</p>`;
    html += got.length ? got.map(card).join('') : '<p>Пока пусто.</p>';
  } else if (jTab === 'guides') {
    const g = all.filter(d => d.kind === 'guide');
    html += `<p class="d">Руководства открываются, когда ты впервые сталкиваешься с механикой. Открыто: ${g.filter(d => have.has(d.id)).length} из ${g.length}.</p>`;
    html += g.map(d => have.has(d.id) ? card(d) : `<div class="note guide locked"><b>???</b><div>Ещё не открыто.</div></div>`).join('');
  } else if (jTab === 'quests') {
    html += `<div class="quests">${Quests.html()}</div>`;
  } else {
    const st = player.st, e = game.started ? exitInfo() : null;
    html += `<div class="sumgrid"><b>Уровень</b><span>${game.level}</span><b>Время на уровне</b><span>${fmtTime(game.playT)}</span><b>Проспано</b><span>${game.hours} ч</span>
      <b>Схема выхода</b><span>${game.notes.length >= BAL.notesNeeded && e ? `выход ${e.arrow} примерно в ${Math.round(e.d)} м` : `записок ${game.notes.length}/${BAL.notesNeeded}`}</span>
      <b>Записей в журнале</b><span>${game.journal.length}</span><b>Заданий выполнено</b><span>${Quests.done.size} из ${Mods.R.quests.all().length}</span>
      <b>Разобрано вещей</b><span>${salvaged.size}</span><b>Построено деталей</b><span>${pieces.size}</span>
      <b>Рассудок</b><span>${Math.round(st.sanity)} · ${st.sanity > 70 ? 'ясный' : st.sanity > 40 ? 'тревожный' : st.sanity > 15 ? 'спутанный' : 'на грани'}</span>
      <b>Зона</b><span>${esc(zoneAt(camera.position.x, camera.position.z).name)}</span></div>`;
  }
  $('jbody').innerHTML = html;
}
document.querySelectorAll('#jtabs button').forEach(b => b.onclick = () => { jTab = b.dataset.jt; renderJournal(); });
function toggleJournal(on = $('journal').classList.contains('hidden')) {
  if (on) { renderJournal(); $('journal').classList.remove('hidden'); game.state = 'journal'; document.exitPointerLock?.(); }
  else { $('journal').classList.add('hidden'); resume(); }
}
$('jclose').onclick = () => toggleJournal(false);
// ---------------- inventory UI: «предмет на курсоре» как в Minecraft
//  ЛКМ — взять/положить/поменять · ПКМ — положить один (или использовать) · Shift+ЛКМ — быстро переложить
//  Ctrl+ЛКМ — взять половину · наведение + 1–6 — в слот быстрого доступа · наведение + G — выбросить
let held = null, hoverSlot = -1, mouseXY = [0, 0];
function renderHeld() {
  const el = $('held'); if (!held) { el.style.display = 'none'; return; }
  el.style.display = 'flex'; el.innerHTML = iconHtml(held.id) + (held.n > 1 ? `<span class="n">${held.n}</span>` : '');
  el.style.left = mouseXY[0] + 'px'; el.style.top = mouseXY[1] + 'px';
}
function returnHeld() { if (!held) return; const left = inv.add(held.id, held.n); if (left) dropStack(held.id, left); held = null; renderHeld(); }
function dropStack(id, n) { const d = camera.getWorldDirection(V3()); for (let k = 0; k < n; k++) spawnItem(id, camera.getWorldPosition(V3()).addScaledVector(d, .5).add(V3(rand(-.05, .05), k * .04, rand(-.05, .05))), d.clone().multiplyScalar(3).add(V3(0, 1, 0))); player.noise += .05; bus.emit('player:drop', {}); }
function quickMove(i) {
  const s = inv.slots[i]; if (!s) return; const st = ITEMS[s.id].stack;
  const range = i < 6 ? [6, inv.slots.length] : [0, 6];
  for (let pass = 0; pass < 2 && s.n > 0; pass++) for (let j = range[0]; j < range[1] && s.n > 0; j++) {
    const t = inv.slots[j];
    if (pass === 0 && t && t.id === s.id && t.n < st) { const k = Math.min(s.n, st - t.n); t.n += k; s.n -= k; }
    if (pass === 1 && !t) { inv.slots[j] = { id: s.id, n: s.n }; s.n = 0; }
  }
  if (!s.n) inv.slots[i] = null; bus.emit('inventory:changed');
}
function sortInventory() {
  const counts = new Map(); for (let i = 6; i < inv.slots.length; i++) { const s = inv.slots[i]; if (s) counts.set(s.id, (counts.get(s.id) || 0) + s.n); inv.slots[i] = null; }
  const order = Object.keys(ITEMS), cat = id => ITEMS[id].use ? 0 : id === 'battery' || id === 'chalk' ? 1 : 2;
  const ids = [...counts.keys()].sort((a, b) => cat(a) - cat(b) || order.indexOf(a) - order.indexOf(b));
  let j = 6; for (const id of ids) { let n = counts.get(id); while (n > 0 && j < inv.slots.length) { const k = Math.min(n, ITEMS[id].stack); inv.slots[j++] = { id, n: k }; n -= k; } if (n > 0) dropStack(id, n); }
  audio.cloth(.4); bus.emit('inventory:changed');
}
function slotClick(i, e) {
  const s = inv.slots[i];
  if (e.button === 0) {
    if (e.shiftKey && !held) { quickMove(i); return; }
    if (!held) { if (!s) return; if (e.ctrlKey && s.n > 1) { const k = Math.ceil(s.n / 2); held = { id: s.id, n: k }; s.n -= k; } else { held = s; inv.slots[i] = null; } }
    else if (!s) { inv.slots[i] = held; held = null; }
    else if (s.id === held.id) { const k = Math.min(held.n, ITEMS[s.id].stack - s.n); s.n += k; held.n -= k; if (!held.n) held = null; if (!k) { inv.slots[i] = held; held = s; } }
    else { inv.slots[i] = held; held = s; }
    audio.click(); bus.emit('inventory:changed');
  } else if (e.button === 2) {
    if (held) {
      if (!s) { inv.slots[i] = { id: held.id, n: 1 }; held.n--; }
      else if (s.id === held.id && s.n < ITEMS[s.id].stack) { s.n++; held.n--; }
      if (held && held.n <= 0) held = null; bus.emit('inventory:changed');
    } else if (s) { useSlot(i); renderInv(); }
  }
}
function invTooltip(i) {
  const tip = $('invtip'), s = i >= 0 ? inv.slots[i] : null;
  if (!s || held) { tip.style.display = 'none'; return; }
  const d = ITEMS[s.id], uses = d.use ? Object.entries(d.use).filter(([k]) => STAT_NAMES[k]).map(([k, v]) => `<span class="${v > 0 ? 'pos' : 'neg'}">${STAT_NAMES[k]} ${v > 0 ? '+' : ''}${v}</span>`).join(' ') : '';
  tip.innerHTML = `<b>${esc(d.name)}</b> <span class="d">×${s.n} / ${d.stack}</span><div>${esc(d.desc || '')}${s.id === 'chalk' ? ` Осталось меток: ${chalkUses}.` : ''}</div>${uses ? `<div class="uses">${uses}</div>` : ''}<div class="d">${d.use || d.onUse || s.id === 'battery' ? 'ПКМ — использовать · ' : ''}Shift+ЛКМ — переложить · G — выбросить</div>`;
  tip.style.display = 'block'; positionTip();
}
const STAT_NAMES = { health: 'здоровье', hunger: 'сытость', thirst: 'вода', energy: 'бодрость', sanity: 'рассудок' };
function positionTip() { const tip = $('invtip'); if (tip.style.display !== 'block') return; const w = tip.offsetWidth, h = tip.offsetHeight; let x = mouseXY[0] + 18, y = mouseXY[1] + 18; if (x + w > innerWidth - 8) x = mouseXY[0] - w - 12; if (y + h > innerHeight - 8) y = innerHeight - h - 8; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
function toggleInventory(on = $('inventory').classList.contains('hidden')) {
  if (on) { if (build.on) setBuildMode(false); renderInv(); $('inventory').classList.remove('hidden'); game.state = 'inv'; keysClear(); document.exitPointerLock?.(); }
  else { returnHeld(); hoverSlot = -1; $('invtip').style.display = 'none'; $('inventory').classList.add('hidden'); resume(); }
}
$('invgrid').addEventListener('mousedown', e => { e.stopPropagation(); const s = e.target.closest('.slot'); if (!s) return; e.preventDefault(); slotClick(+s.dataset.i, e); invTooltip(hoverSlot); });
$('invgrid').addEventListener('mouseover', e => { const s = e.target.closest('.slot'); hoverSlot = s ? +s.dataset.i : -1; invTooltip(hoverSlot); });
$('invgrid').addEventListener('mouseleave', () => { hoverSlot = -1; invTooltip(-1); });
$('btnSort').onclick = sortInventory;
$('inventory').addEventListener('mousedown', e => {
  if (!e.target.isConnected || e.target.closest('.inv-panel')) return;
  if (held) { const n = e.button === 2 ? 1 : held.n; dropStack(held.id, n); held.n -= n; if (held.n <= 0) held = null; renderHeld(); }
  else if (e.button === 0) toggleInventory(false);
});
addEventListener('mousemove', e => { mouseXY = [e.clientX, e.clientY]; if (game.state === 'inv') { if (held) renderHeld(); positionTip(); } });
// клавиши в инвентаре: 1–6 — переместить в слот быстрого доступа, G — выбросить
addEventListener('keydown', e => {
  if (game.state !== 'inv' || hoverSlot < 0) return;
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < 6 && n !== hoverSlot) { const t = inv.slots[n]; inv.slots[n] = inv.slots[hoverSlot]; inv.slots[hoverSlot] = t; audio.click(); bus.emit('inventory:changed'); invTooltip(hoverSlot); } }
  else if (e.code === 'KeyG') { const s = inv.slots[hoverSlot]; if (!s) return; const n = e.shiftKey ? s.n : 1; for (let k = 0; k < n; k++) inv.takeSlot(hoverSlot); dropStack(s.id, n); invTooltip(hoverSlot); }
});
addEventListener('contextmenu', e => e.preventDefault());
// ---------------- всплывающие подборы
function pickupToast(id, n) {
  const box = $('pickups'); let row = [...box.children].find(r => r.dataset.id === id && !r.dataset.fade);
  if (row) { row.dataset.n = +row.dataset.n + n; clearTimeout(row._t); }
  else { row = document.createElement('div'); row.dataset.id = id; row.dataset.n = n; box.appendChild(row); while (box.children.length > 5) box.firstChild.remove(); }
  row.innerHTML = `${iconHtml(id, 'ico sm')}<span>+${row.dataset.n} ${esc(ITEMS[id].name)}</span>`; row.style.opacity = 1;
  row._t = setTimeout(() => { row.dataset.fade = 1; row.style.opacity = 0; setTimeout(() => row.remove(), 800); }, 2600);
}
