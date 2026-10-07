// =====================================================================
//  INPUT
// =====================================================================
const canvas = renderer.domElement;
function keysClear() { for (const k in keys) keys[k] = false; }
function startAudio() { if (!audio.ready) { try { audio.init(); } catch (e) { console.warn(e); } } else audio.ctx.resume?.(); }
function resume() {
  game.state = 'play'; $('menu').classList.add('hidden'); $('clickresume').classList.add('hidden');
  try { const r = canvas.requestPointerLock?.(); r?.catch?.(() => {}); } catch (e) {}
}
function openMenu() {
  if (!game.started) return; game.state = 'menu'; keysClear(); $('clickresume').classList.add('hidden'); $('menu').classList.remove('hidden'); setMenuTab('play'); saveGame(true);
}
// Esc в режиме стройки только выходит из стройки (браузер всё равно снимает захват мыши —
// показываем «кликни, чтобы продолжить», а не меню паузы). Повторный Esc — меню.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas || game.state !== 'play' || player.dead) return;
  if (build.on) { setBuildMode(false); keysClear(); game.state = 'resume'; $('clickresume').classList.remove('hidden'); }
  else openMenu();
});
canvas.addEventListener('click', () => { if ((game.state === 'play' || game.state === 'resume') && document.pointerLockElement !== canvas) resume(); });
addEventListener('mousemove', e => {
  if (game.state !== 'play' || document.pointerLockElement !== canvas || player.sleeping) return;
  const k = .0022 * S.sensitivity; player.yaw -= e.movementX * k; player.pitch = clamp(player.pitch - e.movementY * k, -1.52, 1.52);
});
addEventListener('mousedown', e => {
  if (game.state !== 'play' || document.pointerLockElement !== canvas || player.sleeping) return;
  if (e.button === 0) { if (build.on) placePiece(); else useSlot(inv.sel); }
  else if (e.button === 2) { if (build.on) dismantle(); }
});
addEventListener('wheel', e => {
  if (game.state !== 'play') return; const d = Math.sign(e.deltaY);
  if (build.on) { build.sel = (build.sel + d + BUILD.length) % BUILD.length; scene.remove(build.ghost); build.ghost = pieceObject(BUILD[build.sel], true); scene.add(build.ghost); renderBuildHud(); }
  else { inv.sel = (inv.sel + d + 6) % 6; renderHotbar(); }
}, { passive: true });
let debugOn = false;
addEventListener('keydown', e => {
  if (e.code === 'Tab' || e.code === 'F3' || e.code === 'F4' || e.code === 'F5' || e.code === 'F9') e.preventDefault();
  if (e.code === 'Backquote' && (game.state === 'play' || game.state === 'console')) { e.preventDefault(); DevConsole.toggle(); return; }
  if (game.state === 'console') return;
  if (e.code === 'KeyJ' && (game.state === 'play' || game.state === 'journal')) { toggleJournal(); return; }
  if ((e.code === 'Tab' || e.code === 'KeyI') && (game.state === 'play' || game.state === 'inv')) { toggleInventory(); return; }
  if (e.code === 'Escape' && (game.state === 'inv' || game.state === 'journal')) { e.code === 'Escape' && game.state === 'inv' ? toggleInventory(false) : toggleJournal(false); return; }
  if (e.code === 'F9' && hasSave()) { startAudio(); loadGame(); return; }
  if (e.code === 'Escape' && game.state === 'dialog' && !e.repeat) { if (dialogEsc) closeDialog(); return; }
  if (e.code === 'Escape' && (game.state === 'menu' || !game.started) && !e.repeat) { if (!$('dialog').classList.contains('hidden')) { if (dialogEsc) closeDialog(); return; } menuBack(); return; }
  if (game.state === 'resume') { if (e.code === 'Escape') openMenu(); return; }
  if (e.code === 'Escape' && game.state === 'play' && build.on) { setBuildMode(false); return; } // если захват мыши не был активен
  if (game.state !== 'play') return;
  { const ev = { code: e.code, shift: e.shiftKey, cancel: false }; Mods.emit('key:down', ev); if (ev.cancel) return; }
  keys[e.code] = true; if (e.repeat) return;
  if (player.sleeping || player.dead) return;
  if (e.code === 'Space') jumpPressed = true;
  else if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyF') { if (player.flash.battery > 0) { player.flash.on = !player.flash.on; audio.click(); } else say('Батарейка села.', 2); }
  else if (e.code === 'KeyG') dropSlot(inv.sel, e.shiftKey);
  else if (e.code === 'KeyB') setBuildMode(!build.on);
  else if (e.code === 'KeyR' && build.on) { if (e.shiftKey) build.fine = (build.fine + 1) % 6; else build.rot = (build.rot + 1) % 4; }
  else if (e.code === 'KeyZ') sleep(false);
  else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (build.on) { if (n >= 0 && n < 9) { build.sel = Math.min(n, BUILD.length - 1); setBuildMode(true); } } else if (n >= 0 && n < 6) { inv.sel = n; renderHotbar(); } }
  else if (e.code === 'F3') { debugOn = !debugOn; $('debug').style.display = debugOn ? 'block' : 'none'; }
  else if (e.code === 'F4') randomEvent();
  else if (e.code === 'F5') saveGame();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', keysClear);
$('btnNew').onclick = () => { if (game.started && !confirm('Начать новую игру? Текущее сохранение будет перезаписано.')) return; startAudio(); newGame(); };
$('btnContinue').onclick = () => { startAudio(); if (game.started) resume(); else loadGame(); };
$('btnExport').onclick = exportSave;
$('btnImport').onclick = () => $('fileImport').click();
$('btnSave').onclick = () => { saveGame(); updateMenuInfo(); };
$('btnLoad').onclick = () => { startAudio(); loadGame(); };
if ('showDirectoryPicker' in window) { $('btnFolder').classList.remove('hidden'); $('btnFolder').onclick = pickFolder; }

