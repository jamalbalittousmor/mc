// =====================================================================
//  POST-PROCESSING
// =====================================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.blendIntensity = .75;
gtao.updateGtaoMaterial({ radius: .45, distanceExponent: 1.4, thickness: 1.0, scale: 1, samples: 10 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
const _ov = gtao._overrideVisibility.bind(gtao);
let noAOList = [], noAOT = 0;
gtao._overrideVisibility = function () { _ov(); const cache = this._visibilityCache; if (--noAOT <= 0) { noAOT = 30; noAOList = []; this.scene.traverse(o => { if (o.userData.noAO) noAOList.push(o); }); } for (const o of noAOList) if (o.visible && o.parent) { o.visible = false; cache.push(o); } };
const _gs = gtao.setSize.bind(gtao);
gtao.setSize = (w, h) => _gs(Math.max(2, w * .5 | 0), Math.max(2, h * .5 | 0));
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), S.bloom, .5, .95);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const smaa = new SMAAPass(); composer.addPass(smaa);
const atmos = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: S.grain }, uAnx: { value: 0 }, uUnder: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uFade: { value: 0 }, uHal: { value: 0 }, uPh: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uBlink: { value: 0 }, uHurt: { value: 0 }, uHue: { value: 0 }, uDbl: { value: 0 }, uZoom: { value: 0 }, uTunnel: { value: 0 }, uSnow: { value: 0 }, uAspect: { value: innerWidth / innerHeight },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uGrain, uAnx, uUnder, uFade, uHal, uBlink, uHurt, uAspect, uHue, uDbl, uZoom, uTunnel, uSnow; uniform vec2 uRes; uniform vec4 uPh[4]; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
    float fig(vec2 uv, vec4 P){
      if (P.w < 0.003) return 0.0;
      vec2 d = (uv - P.xy) * vec2(uAspect, 1.0) / P.z;
      float wob = (vn(uv * 9.0 + uTime * 0.7) - 0.5) * 0.5;
      float body = smoothstep(1.0, 0.25, length(vec2(d.x * (1.55 + 0.3 * d.y), (d.y + 0.25) * 0.42)) + wob);
      float head = smoothstep(0.42, 0.1, length(d - vec2(0.0, 1.55)) + wob * 0.6);
      return clamp(max(body, head), 0.0, 1.0) * P.w;
    }
    void main(){
      vec2 uv = (vUv - 0.5) * (1.0 - uZoom * (0.6 + 0.4 * sin(uTime * 2.3))) + 0.5;
      uv += uUnder * vec2(sin(uv.y * 22.0 + uTime * 2.1), cos(uv.x * 19.0 + uTime * 1.7)) * 0.0035;
      vec2 c = uv - 0.5; float r = length(c);
      float ca = (0.0015 + uAnx * 0.005 + uUnder * 0.004) * r * r * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
      if (uDbl > 0.0001) { vec2 o = vec2(sin(uTime * 0.7), cos(uTime * 0.53)) * uDbl; col = mix(col, texture2D(tDiffuse, uv + o).rgb, 0.45); }
      if (abs(uHue) > 0.001) { float Y = dot(col, vec3(0.299, 0.587, 0.114)), I = dot(col, vec3(0.596, -0.274, -0.322)), Q = dot(col, vec3(0.211, -0.523, 0.312)); float ch = cos(uHue), shh = sin(uHue); float I2 = I * ch - Q * shh, Q2 = I * shh + Q * ch; col = vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2); }
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(1.04, 1.0, 0.86), 0.55);
      col = mix(col, vec3(lum) * vec3(0.95, 1.0, 0.9), uAnx * 0.4);
      col = mix(col, col * vec3(0.3, 0.75, 0.85) + vec3(0.0, 0.025, 0.035), uUnder * 0.85);
      // hallucinations: only readable in the dark
      float darkK = 1.0 - smoothstep(0.03, 0.22, lum);
      float shade = 0.0;
      for (int i = 0; i < 4; i++) shade = max(shade, fig(uv, uPh[i]));
      float edge = smoothstep(0.28, 0.75, r);
      float crawl = smoothstep(0.55, 0.85, vn(c * 7.0 + vec2(uTime * 0.13, -uTime * 0.09)) * 0.6 + vn(c * 17.0 - uTime * 0.21) * 0.4) * edge * uHal;
      col *= 1.0 - clamp(shade * (0.35 + 0.6 * darkK) + crawl * 0.55 * (0.4 + 0.6 * darkK), 0.0, 0.92);
      float vig = smoothstep(0.95 - uAnx * 0.25 - uHal * 0.1 - uTunnel * 0.35, 0.25 - uTunnel * 0.12, r * (1.0 + uAnx * 0.4 + uTunnel * 0.5));
      col *= mix(0.35, 1.0, vig);
      col = mix(col, col * vec3(1.0, 0.5, 0.45), uHurt * edge * 0.7);
      float n = h(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += n * (uGrain + uAnx * 0.03 + uHal * 0.02 + uSnow * 0.09) * (1.2 - lum);
      if (uSnow > 0.01) col += step(0.997 - uSnow * 0.004, h(uv * uRes * 0.5 + floor(uTime * 20.0))) * 0.25 * uSnow;
      col += (h(uv * uRes * 1.37 + uTime) - 0.5) / 255.0;
      float bl = smoothstep(0.5 * (1.0 - uBlink) - 0.08, 0.5 * (1.0 - uBlink), abs(c.y)) * step(0.001, uBlink);
      col *= 1.0 - bl;
      gl_FragColor = vec4(col * (1.0 - uFade), 1.0);
    }`,
});
composer.addPass(atmos);
let dynScale = 1;
function applyQuality() {
  const q = QUALITY[S.quality];
  const pr = Math.min(devicePixelRatio, 2) * q.pr * dynScale;
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  atmos.uniforms.uRes.value.set(innerWidth * pr, innerHeight * pr); atmos.uniforms.uAspect.value = innerWidth / innerHeight;
  gtao.enabled = S.ao; bloom.enabled = S.bloom > 0; bloom.strength = S.bloom; atmos.uniforms.uGrain.value = S.grain;
  if (flash.shadow.mapSize.x !== q.shadow) { flash.shadow.mapSize.set(q.shadow, q.shadow); if (flash.shadow.map) { flash.shadow.map.dispose(); flash.shadow.map = null; } }
  const n = q.lights || 5;
  document.documentElement.style.setProperty('--ui', S.uiScale); $('hint') && ($('hint').style.display = S.hints ? '' : 'none');
  if (lightPool.length !== n) setupLightPool(n);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; applyQuality(); });
// adaptive resolution
const perf = { acc: 0, n: 0, t: 0 };
function adaptRes(dt) {
  if (!S.adaptive) { if (dynScale !== 1) { dynScale = 1; applyQuality(); } return; }
  perf.acc += dt; perf.n++; perf.t += dt;
  if (perf.t < 2) return;
  const avg = perf.acc / perf.n; perf.acc = perf.n = perf.t = 0;
  let ns = dynScale;
  // целимся в ≥50 FPS; возвращаем разрешение, как только запас появился (раньше на 60 Гц оно не восстанавливалось)
  const target = S.fpsCap > 0 ? Math.min(50, S.fpsCap * .85) : 50;
  if (avg > 1 / (target - 8)) ns = Math.max(.6, dynScale - .1); else if (avg < 1 / (target + 4)) ns = Math.min(1, dynScale + .05);
  if (Math.abs(ns - dynScale) > .01) { dynScale = ns; applyQuality(); }
}

