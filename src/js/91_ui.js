// =====================================================================
//  INTERACTION
// =====================================================================
function interactTarget() {
  const h = camRay(2.6); if (!h) return null;
  const it = itemByCollider.get(h.collider.handle); if (it) return { kind: 'item', it, text: it.id === 'note' ? 'E — прочитать записку' : `E — подобрать: ${ITEMS[it.id].name}` };
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
function interact() {
  const tg = interactTarget(); if (!tg) return;
  if (tg.kind === 'item') pickup(tg.it);
  else if (tg.kind === 'door') toggleDoor(tg.pc);
  else if (tg.kind === 'bed') sleep(true);
  else if (tg.kind === 'lamp') { tg.pc.light.on = !tg.pc.light.on; audio.click(); }
  else if (tg.kind === 'exit') winLevel();
  else if (tg.kind === 'mod' || tg.kind === 'wobj') tg.run();
}
function pickup(it) {
  if (it.id === 'note') {
    if (it.key) pickedKeys.add(it.key); removeItem(it); audio.pickup();
    const idx = game.journal.length < NOTES.length ? game.journal.length : (Math.random() * NOTES.length | 0);
    if (!game.journal.includes(idx)) game.journal.push(idx); game.notes.push(idx);
    const n = NOTES[idx];
    openDialog(n.t, `<p>${n.b}</p>` + (game.notes.length === 3 ? '<p class="exit" style="color:#9fe8a0">На обороте — схема и стрелка. Теперь ты знаешь, куда идти.</p>' : game.notes.length < 3 ? `<p style="color:#9c9374">На обороте карандашом — часть схемы (${game.notes.length}/3).</p>` : ''), [['ДАЛЬШЕ', closeDialog]]);
    player.st.sanity = clamp(player.st.sanity + 6, 0, 100); bus.emit('note:read', idx); return;
  }
  const left = inv.add(it.id, 1); if (left) { say('Некуда положить.', 2); return; }
  Mods.emit('item:pickup', { id: it.id, key: it.key });
  if (it.key) pickedKeys.add(it.key); removeItem(it); audio.pickup(); player.noise += .02;
  pickupToast(it.id, 1);
}
// ---------------- dialogs
let dialogOpen = false, dialogResume = true;
function openDialog(title, html, buttons, resume = true) {
  $('dtitle').textContent = title; $('dtext').innerHTML = html; const b = $('dbtns'); b.innerHTML = '';
  for (const [label, fn] of buttons) { const e = document.createElement('button'); e.textContent = label; e.onclick = () => fn(); b.appendChild(e); }
  $('dialog').classList.remove('hidden'); dialogOpen = true; dialogResume = resume; game.state = 'dialog'; document.exitPointerLock?.();
}
function closeDialog() { $('dialog').classList.add('hidden'); dialogOpen = false; if (dialogResume) resume(); }
function renderJournal() {
  let html = '';
  if (game.notes.length >= 3) { const e = exitInfo(); html += `<div class="exit">Схема из трёх записок: выход ${e.arrow} примерно в ${Math.round(e.d)} м.</div>`; }
  else html += `<p style="color:#9c9374">Записок с частями схемы: ${game.notes.length}/3</p>`;
  if (!game.journal.length) html += '<p>Пока пусто.</p>';
  html += `<h2 style="margin-top:18px">ЗАДАНИЯ</h2><div class="quests">${Quests.html()}</div><h2 style="margin-top:18px">ЗАПИСКИ</h2>`;
  for (const i of game.journal) html += `<div class="note"><b>${NOTES[i].t}</b><div>${NOTES[i].b}</div></div>`;
  $('jbody').innerHTML = html;
}
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
