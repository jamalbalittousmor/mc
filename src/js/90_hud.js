// =====================================================================
//  GAME STATE / HUD
// =====================================================================
const clock = { elapsedTime: 0 };
const game = { state: 'menu', level: 1, seed: 0, notes: [], journal: [], hours: 0, playT: 0, started: false, lastZone: '', autoT: 45, hoverT: 0, hover: null, shelterT: 0 };
const notesRead = () => game.notes;
function say(text, sec = 5) {
  if (!text) return; const log = $('log'), d = document.createElement('div'); d.textContent = text; log.appendChild(d);
  requestAnimationFrame(() => d.style.opacity = 1);
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1600); }, sec * 1000);
  while (log.children.length > 4) log.firstChild.remove();
}
let zoneTimer = 0;
function showZone(name) { const z = $('zone'); z.textContent = name; z.style.opacity = .85; clearTimeout(zoneTimer); zoneTimer = setTimeout(() => z.style.opacity = 0, 3500); }
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
function exitInfo() {
  const fp = feetPos(), dx = WORLD.exitX - fp.x, dz = WORLD.exitZ - 1.2 - fp.z, d = Math.hypot(dx, dz);
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
  const a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz), i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return { d, arrow: ARROWS[i] };
}
function renderObjectives() {
  const st = player.st, out = [`<div class="t">УРОВЕНЬ ${game.level}</div>`];
  if (game.notes.length < 3) out.push(`▸ Найди записки «К.» с направлением к выходу: <b>${game.notes.length}/3</b>`);
  else { const e = exitInfo(); out.push(`▸ Дойди до двери «ВЫХОД»: <b>${e.arrow} ~${Math.round(e.d)} м</b>`); }
  if (st.thirst < 35) out.push('<span class="w">▸ Найди воду</span>');
  if (st.hunger < 35) out.push('<span class="w">▸ Найди еду</span>');
  if (st.energy < 35) out.push('<span class="w">▸ Выспись — лучше на лежанке в убежище</span>');
  if (st.sanity < 40) out.push('<span class="w">▸ Уйди из темноты, успокойся</span>');
  if (!pieces.size && game.hours < 1) out.push('<span class="d">▸ Убежище: 3 стены рядом + свет (B — стройка)</span>');
  if (player.inShelter) out.push('<span class="d">● Ты в убежище: рассудок восстанавливается</span>');
  Quests.objectiveLines(out);
  let html = Mods.filter('ui:objectives', out).join('<br>');
  if (SFX.hudGlitch > 0) html = html.replace(/[А-Яа-яЁё]/g, c => Math.random() < .3 ? pick('ВЫХОДАНЕТ░▒') : c); if (html !== renderObjectives.last) { $('objectives').innerHTML = html; renderObjectives.last = html; }
}
const STAT_KEYS = ['health', 'hunger', 'thirst', 'energy', 'sanity'];
function renderStats() {
  const st = player.st;
  const gl = SFX.hudGlitch > 0;
  for (const k of STAT_KEYS) { const v = gl ? Math.random() * 100 : st[k]; $('b_' + k).style.width = v.toFixed(1) + '%'; $('v_' + k).textContent = Math.round(v); $('r_' + k).classList.toggle('low', st[k] < 25); }
  $('b_stamina').style.width = (st.stamina * 100).toFixed(0) + '%'; $('r_stamina').classList.toggle('low', player.staminaLock);
  $('r_stamina').style.opacity = st.stamina > .99 && !player.swim ? .35 : 1;
  $('oxy').style.display = st.oxygen < .999 ? 'flex' : 'none'; $('b_oxygen').style.width = (st.oxygen * 100).toFixed(0) + '%';
  ModStats.render();
  const f = player.flash, b = Math.round(f.battery * 100);
  $('battery').innerHTML = `${ICON_SVG.flash}<span class="${f.on ? 'on' : ''}">${f.on ? 'ВКЛ' : 'выкл'}</span><div class="bar"><i style="width:${b}%"></i></div><span>${b}%</span>`;
  $('battery').classList.toggle('low', f.battery < .2);
}
function slotHtml(s, i, extra = '') {
  const def = s && ITEMS[s.id];
  return `<div class="slot${extra}" data-i="${i}">${i < 6 ? `<span class="k">${i + 1}</span>` : ''}${def ? iconHtml(s.id) + (s.n > 1 ? `<span class="n">${s.n}</span>` : '') : ''}</div>`;
}
let hotbarNameT = 0, lastSel = -1, lastSelId = null;
function renderHotbar() {
  $('hotbar').innerHTML = inv.slots.slice(0, 6).map((s, i) => slotHtml(s, i, i === inv.sel ? ' sel' : '')).join('');
  const a = inv.active(), id = a ? a.id : null;
  if (inv.sel !== lastSel || id !== lastSelId) {
    lastSel = inv.sel; lastSelId = id; const el = $('itemname');
    el.textContent = a ? ITEMS[a.id].name + (a.id === 'chalk' ? ` · меток: ${chalkUses}` : '') : ''; el.style.opacity = a ? 1 : 0;
    clearTimeout(hotbarNameT); hotbarNameT = setTimeout(() => el.style.opacity = 0, 2200);
  }
}
function renderInv() { renderCraft(); $('invgrid').innerHTML = inv.slots.map((s, i) => slotHtml(s, i, (i < 6 ? ' hb' : '') + (i === inv.sel ? ' sel' : ''))).join(''); renderHeld(); }
function renderBuildHud() {
  const h = $('buildhud'); h.style.display = build.on ? 'block' : 'none'; if (!build.on) return;
  const costStr = c => Object.entries(c).map(([k, n]) => `<span class="${inv.count(k) >= n ? '' : 'miss'}">${iconHtml(k, 'ico sm')}${n}</span>`).join(' ');
  h.innerHTML = `<div class="bt">СТРОЙКА</div>` + BUILD.map((b, i) => `<div class="bi ${i === build.sel ? 'on' : canAfford(b) ? '' : 'no'}"><span class="bk">${i < 9 ? i + 1 : ''}</span><span class="bn">${b.name}</span><span class="bc">${costStr(b.cost)}</span></div>`).join('') +
    `<div class="why">${build.why || '&nbsp;'}</div><div class="bh"><b>ЛКМ</b> поставить · <b>ПКМ</b> разобрать · <b>R</b> поворот · <b>Shift+R</b> точно · <b>колесо/1–9</b> выбор · <b>B</b>/<b>Esc</b> выход</div>`;
}
bus.on('inventory:changed', () => { renderHotbar(); if (!$('inventory').classList.contains('hidden')) renderInv(); if (build.on) renderBuildHud(); });
function showSaved(text = 'сохранено') { const m = $('savemsg'); m.textContent = text; m.style.opacity = 1; setTimeout(() => m.style.opacity = 0, 1500); }
// подсказка действия: «E — текст» → [E] текст
function setPrompt(text) {
  const el = $('prompt'); if (el._t === text) return; el._t = text;
  if (!text) { el.innerHTML = ''; return; }
  const m = /^([A-Za-zА-Яа-я0-9]+)\s+—\s+(.*)$/.exec(text);
  el.innerHTML = m ? `<span class="key">${esc(m[1])}</span>${esc(m[2])}` : `<span class="dim">${esc(text)}</span>`;
}
