// =====================================================================
//  BOOT
// =====================================================================
applyQuality(); Watcher.init();
await Mods.boot();
initWorldGen(1); prebuild(2, 2); teleport(2, 0, 2); player.yaw = Math.PI * .75; updateCamera(.016, 0);
$('loading').classList.add('hidden'); $('menubtns').classList.remove('hidden');
updateMenuInfo(); if (hasSave()) $('btnContinue').classList.remove('hidden');
fade(.55, 2);
requestAnimationFrame(frame);
window.game = { Watcher, updatePlayer, updatePieces, keys, world, chunkUpdate, WorldObj, feetPos, camera, ITEMS, BUILD, interactTarget, toggleInventory, renderInv, processBake, Chunk, layoutOf, zoneAt, spawnItem, worldItems, SFX, forceSanityFX, MOVE, Mods, Machines, Quests, Recipes, game, player, inv, dir, hall, S, WORLD, chunks, pieces, runEvent, EVENTS, saveGame, loadGame, newGame, nextLevel, teleport, audio, renderer, POWER, setBuildMode, build, interact, sleep, breakdown, prevLevel, travel, CURFEW, Shadow, Spiders, Horror, NOTE_DEFS, unlockNote };
