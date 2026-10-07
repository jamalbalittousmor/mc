// =====================================================================
//  MENU — главное меню и пауза: вкладки, свои слайдеры/переключатели
//  (без Tweakpane), настройки модов, менеджер модов. Esc — назад.
// =====================================================================
const QOPT = { 'Низкое': 'Низкое', 'Среднее': 'Среднее', 'Высокое': 'Высокое' };
const rebuildWater = () => { WATER.mat = null; for (const k of [...matCache.keys()]) if (k.startsWith('water')) matCache.delete(k); for (const c of [...chunks.values()]) rebuildChunk(c.cx, c.cz); };
const SETTINGS_UI = [
  { cat: 'Графика', items: [
    ['quality', 'Качество', { options: QOPT }, applyQuality], ['adaptive', 'Адаптивное разрешение', {}, applyQuality, 'Снижает разрешение, если FPS падает ниже 50.'],
    ['ao', 'Затенение углов (GTAO)', {}, applyQuality], ['shadows', 'Тени от фонарика'], ['bloom', 'Свечение ламп', { min: 0, max: 1.5, step: .01 }, applyQuality],
    ['grain', 'Зерно плёнки', { min: 0, max: .15, step: .005 }, applyQuality], ['viewdist', 'Дальность прорисовки, м', { min: 28, max: 70, step: 1 }],
    ['water', 'Вода в бассейнах', { options: { 'Красивая (отражения, преломление)': 'Красивая', 'Простая': 'Простая' } }, rebuildWater],
    ['fpsCap', 'Лимит FPS', { options: { 'Без лимита': 0, '30': 30, '60': 60, '90': 90, '120': 120, '144': 144, '165': 165, '240': 240 } }],
  ] },
  { cat: 'Звук', items: [['volume', 'Общая громкость', { min: 0, max: 1, step: .01 }], ['ambience', 'Гул ламп и «воздух» помещения', { min: 0, max: 1, step: .01 }, null, 'По умолчанию здесь почти тихо: гудят лишь отдельные лампы, если стоять прямо под ними, и мигающие. Редкие далёкие звуки здания от этой настройки не зависят.'], ['steps', 'Громкость шагов', { min: 0, max: 1, step: .01 }]] },
  { cat: 'Камера и мышь', items: [['sensitivity', 'Чувствительность мыши', { min: .2, max: 3, step: .05 }], ['fov', 'Поле зрения (по горизонтали)', { min: 70, max: 120, step: 1 }], ['headbob', 'Покачивание камеры при ходьбе']] },
  { cat: 'Интерфейс', items: [['uiScale', 'Размер интерфейса', { min: .8, max: 1.6, step: .05 }, applyQuality], ['hints', 'Подсказки клавиш', {}, applyQuality]] },
  { cat: 'Игра', items: [['halluc', 'Сила галлюцинаций', { min: 0, max: 1.5, step: .05 }]] },
];
// ---- универсальный построитель контролов (используется и для настроек модов)
function controlRow(obj, k, label, sc = {}, onChange, help) {
  const row = document.createElement('div'); row.className = 'set-row';
  const v0 = obj[k], name = document.createElement('span'); name.textContent = label; row.appendChild(name);
  let input, val = document.createElement('span'); val.className = 'v';
  const fmt = v => typeof v === 'number' ? (sc.step && sc.step < 1 ? (+v).toFixed(String(sc.step).split('.')[1]?.length || 2) : String(v)) : '';
  if (sc.options) {
    input = document.createElement('select');
    for (const [lab, v] of Object.entries(sc.options)) { const o = document.createElement('option'); o.textContent = lab; o.value = JSON.stringify(v); if (v === v0) o.selected = true; input.appendChild(o); }
    input.onchange = () => { obj[k] = JSON.parse(input.value); onChange?.(k, obj[k]); };
  } else if (typeof v0 === 'boolean') {
    input = document.createElement('input'); input.type = 'checkbox'; input.className = 'tgl'; input.checked = v0;
    input.onchange = () => { obj[k] = input.checked; onChange?.(k, obj[k]); };
  } else if (typeof v0 === 'number') {
    const min = sc.min ?? 0, max = sc.max ?? Math.max(1, v0 * 2), step = sc.step ?? (max - min) / 100;
    input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = v0; val.textContent = fmt(v0);
    input.oninput = () => { obj[k] = +input.value; val.textContent = fmt(obj[k]); onChange?.(k, obj[k]); };
  } else {
    input = document.createElement('input'); input.type = 'text'; input.value = v0 ?? '';
    input.onchange = () => { obj[k] = input.value; onChange?.(k, obj[k]); };
  }
  row.appendChild(input); row.appendChild(val);
  if (help) { const h = document.createElement('div'); h.className = 'h'; h.textContent = help; row.appendChild(h); }
  return row;
}
let setCat = 0;
function renderSettings() {
  const cats = $('setcats'), box = $('settings'); cats.innerHTML = ''; box.innerHTML = '';
  SETTINGS_UI.forEach((c, i) => { const b = document.createElement('button'); b.textContent = c.cat.toUpperCase(); b.classList.toggle('on', i === setCat); b.onclick = () => { setCat = i; renderSettings(); }; cats.appendChild(b); });
  const c = SETTINGS_UI[setCat];
  for (const [k, label, sc, fn, help] of c.items) box.appendChild(controlRow(S, k, label, sc, () => { saveSettings(); fn?.(); }, help));
  const reset = document.createElement('button'); reset.textContent = 'СБРОСИТЬ ЭТУ КАТЕГОРИЮ'; reset.style.marginTop = '1rem';
  reset.onclick = () => { for (const [k] of c.items) if (k in S_DEFAULT) S[k] = S_DEFAULT[k]; saveSettings(); applyQuality(); renderSettings(); };
  box.appendChild(reset);
}
// ---- вкладки меню и стек «назад»
let menuTab = 'play';
function setMenuTab(t) {
  menuTab = t;
  document.querySelectorAll('#menubtns button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('.menu-main section').forEach(s => s.classList.toggle('on', s.dataset.pane === t));
  if (t === 'settings') renderSettings(); else if (t === 'mods') renderModPane(); else if (t === 'play') updateMenuInfo();
}
document.querySelectorAll('#menubtns button').forEach(b => b.onclick = () => setMenuTab(b.dataset.tab));
// Esc в меню: из вкладки → на «Игра», из «Игра» → вернуться в игру
function menuBack() { if (menuTab !== 'play') { setMenuTab('play'); return true; } if (game.started && !player.dead) { resume(); return true; } return false; }
function openModManager() { if (game.state === 'dialog') closeDialog(); $('menu').classList.remove('hidden'); if (game.started) game.state = 'menu'; setMenuTab('mods'); }
// ---- менеджер модов (вкладка)
let modsDirty = false;
function renderModPane() {
  const el = $('modpane'), fs = 'showDirectoryPicker' in window;
  const st = { active: '<span style="color:#9fe8a0">активен</span>', disabled: '<span style="color:#9c9374">выключен</span>', error: '<span style="color:#e88a7a">ошибка</span>', conflict: '<span style="color:#e8b07a">конфликт</span>' };
  const folder = ModLoader.folder ? `Папка модов: <b>${esc(ModLoader.folder.name)}</b> (${ModLoader.folderState === 'granted' ? 'подключена' : 'нужно разрешение'})` : 'Папка модов не выбрана — загружаются файлы из Mods/ рядом с игрой и установленные.';
  el.innerHTML = `<p class="d">Мод — это .js-файл в папке <b>Mods</b> (список — Mods/mods.js). ${folder}</p>${modsDirty ? '<div class="banner">Изменения вступят в силу после перезагрузки. <button id="mReload">ПЕРЕЗАГРУЗИТЬ</button></div>' : ''}<div class="col" style="flex-direction:row;flex-wrap:wrap;max-width:none" id="mbtns"></div><div id="mlist"></div>`;
  const btns = $('mbtns'), B = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; btns.appendChild(b); };
  if (fs) B(ModLoader.folder ? 'СМЕНИТЬ ПАПКУ' : 'ВЫБРАТЬ ПАПКУ MODS', () => ModLoader.pickFolder());
  if (ModLoader.folder && ModLoader.folderState !== 'granted') B('РАЗРЕШИТЬ ДОСТУП', () => ModLoader.grantFolder());
  B('УСТАНОВИТЬ .JS', () => $('modfile').click()); B('ПЕРЕЗАГРУЗИТЬ ИГРУ', () => { if (game.started) saveGame(true); location.reload(); });
  if ($('mReload')) $('mReload').onclick = () => { if (game.started) saveGame(true); location.reload(); };
  const list = $('mlist');
  for (const r of Mods.records) {
    const card = document.createElement('div'); card.className = 'mod-card';
    const del = r.source.startsWith('библиотека/') ? ` <a href="#" data-del="${esc(r.source.slice(11))}" style="color:#e88a7a">удалить</a>` : '';
    card.innerHTML = `<div class="top"><b>${esc(r.def.name || r.id)}</b><span class="d">${esc(r.id)}@${esc(r.def.version || '?')} · ${esc(r.source)}</span>${del}<span class="sp"></span>${r.def.required ? '<span class="d">обязательный</span>' : `<input type="checkbox" class="tgl" ${Mods.disabled.has(r.id) ? '' : 'checked'}>`}</div><div class="d">${st[r.status] || r.status}${r.reason ? ' — ' + esc(r.reason) : ''}${r.def.description ? ' · ' + esc(r.def.description) : ''}</div>`;
    const cb = card.querySelector('input.tgl'); if (cb) cb.onchange = () => { Mods.setEnabled(r.id, cb.checked); modsDirty = true; renderModPane(); };
    const a = card.querySelector('a[data-del]'); if (a) a.onclick = e => { e.preventDefault(); ModLoader.uninstall(a.dataset.del); };
    const sets = ModSettings.list.filter(s => s.mod === r.id);
    if (sets.length) {
      const sbox = document.createElement('div'); sbox.className = 'set';
      for (const s of sets) for (const k in s.defaults) { const sc = (s.opts.schema || {})[k] || {}; sbox.appendChild(controlRow(s.obj, k, sc.label || k, sc, (kk, v) => { localStorage.setItem(s.key, JSON.stringify(s.obj)); try { s.opts.onChange?.(kk, v); } catch (e) { Mods.error(r.id, e); } }, sc.help)); }
      card.appendChild(sbox);
    }
    list.appendChild(card);
  }
  if (Mods.conflicts.length) { const p = document.createElement('p'); p.className = 'd'; p.innerHTML = 'Перекрытия контента (решены автоматически): ' + Mods.conflicts.slice(-12).map(c => `${esc(c.reg)}:${esc(c.id)} → ${esc(c.winner)}`).join(', '); list.appendChild(p); }
}
$('btnSetExport').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })); a.download = 'backrooms_settings.json'; a.click(); };
