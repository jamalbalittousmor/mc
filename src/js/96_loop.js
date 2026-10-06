// =====================================================================
//  MAIN LOOP
// =====================================================================
let last = performance.now(), lastDraw = 0, slowT = 0, fpsS = 60, heartT = 0, itemT = 0;
const _l = new THREE.Color(), fogC = new THREE.Color();
function syncItems(dt) {
  itemT -= dt; const probe = itemT <= 0; if (probe) itemT = .3;
  for (const it of worldItems) {
    const tr = it.body.translation(), ck = Math.floor(tr.x / CS) + ',' + Math.floor(tr.z / CS), loaded = chunks.has(ck);
    if (it.body.isEnabled && it.body.isEnabled() !== loaded) it.body.setEnabled(loaded);
    it.mesh.visible = loaded; if (!loaded) continue;
    if (tr.y < -8) { it.body.setTranslation({ x: tr.x, y: 1, z: tr.z }, true); it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    const r = it.body.rotation(); it.mesh.position.set(tr.x, tr.y, tr.z); it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    if (probe || it.probeT === 0) { it.probeT = 1; const m = it.mesh.material; sampleLight(tr.x, tr.y + .15, tr.z, _l); m.emissive.copy(m.color).multiply(_l).multiplyScalar(.7 * POWER.value); if (m.map && !m.emissiveMap) { m.emissiveMap = m.map; m.needsUpdate = true; } }
  }
  for (const pc of pieces) if (pc.def.dynamic) { const tr = pc.body.translation(), loaded = chunks.has(Math.floor(tr.x / CS) + ',' + Math.floor(tr.z / CS)); if (pc.body.isEnabled && pc.body.isEnabled() !== loaded) pc.body.setEnabled(loaded); }
}
function frame(now) {
  requestAnimationFrame(frame);
  // необязательный лимит FPS (по умолчанию — без лимита: столько, сколько даёт монитор/браузер)
  if (S.fpsCap > 0 && now - lastDraw < 1000 / S.fpsCap - 1) return;
  lastDraw = now;
  const rdt = Math.min(.1, (now - last) / 1000); last = now; const dt = Math.min(rdt, .05);
  fpsS = lerp(fpsS, 1 / Math.max(rdt, 1e-3), .05);
  const active = game.started && (game.state === 'play' || player.sleeping || player.dead);
  U.time.value = now / 1000; atmos.uniforms.uTime.value = now / 1000;
  if (!game.started) { composer.render(); return; }
  if (active) {
    clock.elapsedTime += dt; game.playT += dt;
    // физика с переменным шагом: один шаг на кадр, без интерполяции и «залипания» на 60 Гц
    const pdt = Math.min(dt, 1 / 30); world.timestep = pdt;
    updatePlayer(pdt); updatePieces(pdt); WorldObj.update(pdt); world.step();
    const fp = feetPos(); chunkUpdate(fp.x, fp.z, 1);
    syncItems(dt);
    processBake(3); Machines.update(dt); Quests.update(dt); Mods.emit('update', dt);
    updateSurvival(dt); updateDirector(dt); Watcher.update(dt); updateHallucinations(dt, clock.elapsedTime); updateSanityFX(dt);
    game.shelterT -= dt; if (game.shelterT <= 0) { game.shelterT = .5; updateShelter(); }
    game.autoT -= dt; if (game.autoT <= 0) { game.autoT = 45; saveGame(true); }
    // panic heartbeat
    heartT -= dt; if (player.st.panic > .45 && heartT <= 0) { heartT = 60 / (70 + player.st.panic * 80); audio.heartbeat(smooth(.45, 1, player.st.panic) * .8); }
  }
  updateCamera(dt, clock.elapsedTime);
  cullChunks(camera.position);
  updateBuild();
  const cp = camera.position;
  updateLights(dt, clock.elapsedTime, cp); measureLight(dt, cp);
  // zone fog / name
  const zone = zoneAt(cp.x, cp.z);
  if (zone.key !== game.lastZone) { game.lastZone = zone.key; if (game.state === 'play') showZone(zone.name); }
  const under = player.under, pw = POWER.value;
  fogC.set(under ? 0x0a2a30 : zone.fog[0]).multiplyScalar(.35 + .65 * pw);
  scene.fog.color.lerp(fogC, 1 - Math.exp(-3 * dt));
  scene.fog.density = damp(scene.fog.density, under ? .22 : zone.fog[1] * (1 + (1 - pw) * .6), 3, dt);
  // post uniforms
  const st = player.st, A = atmos.uniforms;
  A.uAnx.value = damp(A.uAnx.value, clamp(st.panic + (1 - st.sanity / 100) * .4, 0, 1), 2, dt);
  A.uUnder.value = damp(A.uUnder.value, under ? 1 : 0, 12, dt);
  A.uHue.value = damp(A.uHue.value, SFX.hue, 3, dt); A.uDbl.value = damp(A.uDbl.value, SFX.dbl, 4, dt); A.uZoom.value = damp(A.uZoom.value, SFX.zoom, 4, dt); A.uTunnel.value = damp(A.uTunnel.value, SFX.tunnel, 3, dt); A.uSnow.value = damp(A.uSnow.value, SFX.snow, 4, dt);
  A.uHal.value = hall.k; hallUniforms(A.uPh.value); A.uBlink.value = hall.blink;
  A.uHurt.value = damp(A.uHurt.value, st.health < 35 ? (1 - st.health / 35) * (.6 + .4 * Math.sin(now / 300)) : 0, 3, dt);
  dustMat.uniforms.uCam.value.copy(cp);
  // audio
  const zk = zone.key, fpp = feetPos();
  const water = zk === 'pools' ? (isPoolAt(fpp.x + 3, fpp.z) || isPoolAt(fpp.x - 3, fpp.z) || isPoolAt(fpp.x, fpp.z + 3) || isPoolAt(fpp.x, fpp.z - 3) || isPoolAt(fpp.x, fpp.z) ? 1 : .35) : zone.flood ? .3 : 0;
  audio.update(dt, { hum: dir.hum, anx: st.panic, water, reverb: zone.reverb ?? .4, under, paused: game.state !== 'play', sleep: player.sleeping, pos: cp, fwd: camera.getWorldDirection(V3()), tinnitus: dir.blackout > 0 ? .6 : SFX.muffle, muffle: SFX.muffle });
  // HUD (throttled)
  slowT -= rdt;
  if (slowT <= 0 && game.state === 'play') {
    slowT = .12; renderStats(); renderObjectives(); if (build.on) renderBuildHud();
    const tg = !build.on && !player.sleeping ? interactTarget() : null; setPrompt(tg ? tg.text : '');
    if (debugOn) $('debug').textContent = `fps ${fpsS.toFixed(0)}  scale ${dynScale.toFixed(2)}  calls ${renderer.info.render.calls}\npos ${fpp.x.toFixed(1)} ${fpp.y.toFixed(2)} ${fpp.z.toFixed(1)}  zone ${zk}  chunks ${chunks.size}  items ${worldItems.size}\nlight ${player.lightLevel.toFixed(3)}  attention ${dir.attention.toFixed(2)}  hall ${hall.k.toFixed(2)}  power ${pw.toFixed(2)}  hum ${dir.hum.toFixed(2)}\nexit ${WORLD.exitX},${WORLD.exitZ}  last event: ${dir.lastEvent}  sanityFX T ${SFX.T.toFixed(2)} [${SFX.list.map(e => e.def.id).join(',')}]\n${STAT_KEYS.map(k => k + ' ' + st[k].toFixed(0)).join('  ')}  panic ${st.panic.toFixed(2)}`;
  }
  if (game.state === 'play') adaptRes(rdt);
  composer.render();
}

$('btnMods').onclick = () => openModManager();
$('modfile').onchange = e => ModLoader.install([...e.target.files]);
$('conin').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Enter') { DevConsole.run(e.target.value); e.target.value = ''; } else if (e.code === 'Backquote' || e.code === 'Escape') { e.preventDefault(); DevConsole.toggle(); } });
