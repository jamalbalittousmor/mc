// =====================================================================
//  HALLUCINATIONS — peripheral dark figures + creeping darkness
//  (screen-space, anchored to world directions, fade when looked at)
// =====================================================================
const hall = { list: [], k: 0, spawnT: 5, blink: 0, blinkT: 20 };
function hallIntensity() {
  const st = player.st;
  return S.halluc * clamp((1 - st.sanity / 100) * 1.15 + Math.max(0, 1 - st.energy / 60) * .7 + st.panic * .4 - .3, 0, 1.2);
}
function updateHallucinations(dt, t) {
  const H = hall.k = damp(hall.k, player.dead || player.sleeping ? 0 : hallIntensity(), 1, dt);
  hall.spawnT -= dt * (.4 + H * 2.2);
  if ((H > .08 || hall.forced) && hall.spawnT <= 0 && hall.list.length < 4) {
    if (hall.forced) { hall.forced = false; hall.k = Math.max(hall.k, .35); }
    hall.spawnT = rand(4, 10);
    const side = Math.random() < .5 ? -1 : 1, dart = Math.random() < .35;
    hall.list.push({ yaw: player.yaw + side * rand(.75, 1.15) * (S.fov / 90), pitch: rand(-.12, .05), life: rand(2.5, 7), age: 0, a: 0, seen: false, dart, vy: dart ? -side * rand(.6, 1.2) : rand(-.03, .03), size: rand(.8, 1.3) });
  }
  const camDir = camera.getWorldDirection(V3());
  for (let i = hall.list.length - 1; i >= 0; i--) {
    const h = hall.list[i]; h.age += dt; h.yaw += h.vy * dt;
    const d = V3(0, 0, -1).applyEuler(new THREE.Euler(h.pitch, h.yaw, 0, 'YXZ'));
    const look = d.dot(camDir);
    if (look > .93 && h.a > .1 && !h.seen) { h.seen = true; if (Math.random() < .5) { audio.heartbeat(.5); addPanic(.03); } }
    const target = h.seen || h.age > h.life ? 0 : smooth(.98, .7, look) * H;
    h.a = damp(h.a, target, h.seen ? 9 : 1.6, dt);
    if ((h.seen || h.age > h.life) && h.a < .01) hall.list.splice(i, 1);
  }
  // micro-sleep blinks when exhausted
  hall.blinkT -= dt;
  if (player.st.energy < 12 && hall.blinkT < 0 && !player.sleeping) { hall.blinkT = rand(8, 20) * (.5 + player.st.energy / 12); hall.blink = 1; }
  hall.blink = Math.max(0, hall.blink - dt * 1.4);
}
function hallUniforms(arr) {
  const v = V3();
  for (let i = 0; i < 4; i++) {
    const h = hall.list[i], u = arr[i];
    if (!h) { u.set(0, 0, 0, 0); continue; }
    v.set(0, 0, -1).applyEuler(new THREE.Euler(h.pitch, h.yaw, 0, 'YXZ')).add(camera.position).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.4) { u.set(0, 0, 0, 0); continue; }
    u.set(v.x * .5 + .5, v.y * .5 + .5 - .05, .06 * h.size, h.a);
  }
}


