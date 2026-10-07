// =====================================================================
//  MATERIALS
// =====================================================================
function rep(t, x, y) { const c = t.clone(); c.repeat.set(x, y); c.needsUpdate = true; return c; }
const causticGLSL = `
float causticF(vec2 p, float t){
  vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 4; n++) { float tt = t * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
  c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0);
}`;
function addWorldPos(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n vec4 wpX = vec4(transformed,1.0);\n #ifdef USE_INSTANCING\n wpX = instanceMatrix * wpX;\n #endif\n vWPos = (modelMatrix * wpX).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform float uTime;\nuniform float uCaus;');
  sh.uniforms.uTime = U.time; sh.uniforms.uCaus = U.caustic;
}
TEX.exit = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#031a08'; g.fillRect(0, 0, w, h); g.fillStyle = '#7dffa0'; g.font = 'bold 64px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', w / 2, h / 2 + 4); }, true, false);
TEX.note = canvasTex(128, 160, (g, w, h) => { g.fillStyle = '#e8e0c8'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(40,40,80,.55)'; g.lineWidth = 2; for (let y = 22; y < h - 10; y += 12) { g.beginPath(); g.moveTo(12, y); g.lineTo(12 + Math.random() * 90 + 10, y); g.stroke(); } }, true, false);

// =====================================================================
//  MATERIALS — static world uses baked per-vertex light (aLight)
// =====================================================================
function withBake(m, extra) {
  m.onBeforeCompile = sh => {
    extra?.(sh);
    sh.uniforms.uBake = U.bake; sh.uniforms.uBreath = U.breath; sh.uniforms.uTimeB = U.time;
    sh.uniforms.uFixTex = U.fixTex;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aLight;\nattribute vec4 aFixI;\nattribute vec4 aFixW;\nuniform sampler2D uFixTex;\nvarying vec3 vBake;\nvec3 fixC(float id){ int i = int(id + 0.5); return texelFetch(uFixTex, ivec2(i % 64, i / 64), 0).rgb; }')
      .replace('#include <common>', '#include <common>\nuniform float uBreath; uniform float uTimeB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = aLight + aFixW.x * fixC(aFixI.x) + aFixW.y * fixC(aFixI.y) + aFixW.z * fixC(aFixI.z) + aFixW.w * fixC(aFixI.w);\nif (uBreath > 0.001 && abs(normal.y) < 0.5) { vec3 wpB = (modelMatrix * vec4(transformed, 1.0)).xyz; transformed += normal * uBreath * 0.06 * sin(wpB.x * 0.7 + wpB.z * 0.55 + wpB.y * 1.6 + uTimeB * 1.3) * (0.6 + 0.4 * sin(uTimeB * 0.4 + wpB.y)); }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vBake;\nuniform float uBake;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBake * uBake;');
  };
  return m;
}
// ---------- вода: многооктавные волны (градиент высоты) + физический материал с преломлением
const WAVES_GLSL = `
vec2 waveGrad(vec2 p, float t){
  vec2 g = vec2(0.0);
  vec2 d1 = normalize(vec2(1.0, 0.3));  g += d1 * 1.6  * 0.020  * cos(dot(d1, p) * 1.6  + t * 0.9);
  vec2 d2 = normalize(vec2(-0.4, 1.0)); g += d2 * 2.7  * 0.012  * cos(dot(d2, p) * 2.7  + t * 1.3);
  vec2 d3 = normalize(vec2(0.7, -0.8)); g += d3 * 4.9  * 0.006  * cos(dot(d3, p) * 4.9  + t * 1.9);
  vec2 d4 = normalize(vec2(-0.9, -0.2));g += d4 * 9.0  * 0.0025 * cos(dot(d4, p) * 9.0  + t * 2.6);
  vec2 d5 = normalize(vec2(0.2, 0.95)); g += d5 * 15.0 * 0.0012 * cos(dot(d5, p) * 15.0 - t * 3.1);
  vec2 d6 = normalize(vec2(-0.6, 0.7)); g += d6 * 23.0 * 0.0006 * cos(dot(d6, p) * 23.0 + t * 4.0);
  return g;
}`;
// Глубокая вода (бассейны): свой шейдер. Отражение — аналитический потолок с картой
// светильников (FMAP), преломление — копия кадра без воды (SceneWaterPass), поглощение
// по длине пути до дна, окно Снелла снизу, туман вручную, блик фонаря.
const WATER = { visible: false, mat: null };
function waterMaterial() {
  if (WATER.mat) return WATER.mat;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.time, tScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uFix: { value: null }, uFixO: { value: new THREE.Vector2() },
      uH: { value: 4.2 }, uDepth: { value: POOL_D }, uWY: { value: WATER_Y }, uFogC: { value: new THREE.Color() }, uFogD: { value: .04 },
      uFlP: { value: new THREE.Vector3() }, uFlD: { value: new THREE.Vector3(0, 0, -1) }, uFlI: { value: 0 }, uPow: { value: 1 }, uCaus: U.caustic,
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `precision highp float; varying vec3 vW;
      uniform float uTime, uH, uDepth, uWY, uFogD, uFlI, uPow, uCaus; uniform vec2 uRes, uFixO; uniform vec3 uFogC, uFlP, uFlD; uniform sampler2D tScene, uFix;
      ${WAVES_GLSL}
      vec3 ceilAt(vec3 p, float dist){
        vec2 c = floor(p.xz / 4.0); vec2 lc = c - uFixO; vec3 col = vec3(0.035, 0.04, 0.04) * uPow;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 q = lc + vec2(float(i), float(j)); if (q.x < 0.0 || q.y < 0.0 || q.x > 31.0 || q.y > 31.0) continue;
          vec4 f = texelFetch(uFix, ivec2(q), 0); if (f.a < -0.5) continue;
          vec2 d = p.xz - (c + vec2(float(i), float(j)) + 0.5) * 4.0; if (f.a > 0.5) d = d.yx;
          vec2 e = abs(d) - vec2(0.6, 0.3); float o = length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
          float soft = 0.02 + dist * 0.012;
          col += f.rgb * (6.0 * (1.0 - smoothstep(-soft, soft, o)) + 0.25 * exp(-dot(d, d) * 0.35));
        }
        return col;
      }
      void main(){
        vec3 toC = cameraPosition - vW; float dist = length(toC); vec3 V = -toC / dist;
        vec2 g = waveGrad(vW.xz, uTime) * 1.1 * clamp(1.6 - dist * 0.03, 0.4, 1.0);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec2 suv = gl_FragCoord.xy / uRes; vec3 col;
        if (cameraPosition.y > uWY) {
          float cosi = max(dot(-V, n), 0.0), F = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
          vec3 R = reflect(V, n); vec3 refl = vec3(0.02);
          if (R.y > 0.001) { float t = (uH - vW.y) / R.y; vec3 hp = vW + R * t; refl = ceilAt(hp, t) * exp(-t * uFogD * 0.8); }
          vec3 T = refract(V, n, 0.75); float tb = T.y < -0.001 ? (-uDepth - vW.y) / T.y : 6.0; tb = min(tb, 8.0);
          vec2 off = n.xz * 0.06 * clamp(tb * 0.5, 0.1, 1.0) / max(dist * 0.25, 1.0);
          vec3 refr = texture2D(tScene, clamp(suv + off, 0.002, 0.998)).rgb;
          float path = tb + max(0.0, -V.y < 0.05 ? 3.0 : 0.0);
          refr = refr * exp(-path * vec3(0.42, 0.10, 0.08)) + vec3(0.01, 0.045, 0.05) * (1.0 - exp(-path * 0.35)) * uPow;
          col = mix(refr, refl, F);
          vec3 L = normalize(uFlP - vW); float sp = pow(max(dot(reflect(-L, n), -V), 0.0), 160.0) * max(dot(L, -uFlD) > 0.0 ? smoothstep(0.85, 0.95, dot(-L, uFlD)) : 0.0, 0.0);
          col += vec3(1.0, 0.96, 0.88) * sp * uFlI * 0.6;
        } else {
          vec3 nn = -n; float cosi = max(dot(-V, nn), 0.0);
          float sinT = 1.333 * sqrt(max(0.0, 1.0 - cosi * cosi));
          vec3 deep = vec3(0.012, 0.05, 0.058) * uPow;
          if (sinT >= 1.0) col = deep * 1.4;
          else { vec2 off = n.xz * 0.05; vec3 above = texture2D(tScene, clamp(suv + off, 0.002, 0.998)).rgb; float F = 0.02 + 0.98 * pow(1.0 - sqrt(1.0 - sinT * sinT), 5.0); col = mix(above * vec3(0.7, 0.95, 1.0), deep, F) ; col = mix(col, deep * 1.4, smoothstep(0.85, 1.0, sinT)); }
          col *= exp(-dist * vec3(0.3, 0.08, 0.06));
        }
        float fg = 1.0 - exp(-uFogD * uFogD * dist * dist);
        gl_FragColor = vec4(mix(col, uFogC, fg), 1.0);
      }`,
    side: THREE.DoubleSide,
  });
  m.uniforms.uFix.value = FMAP.tex;
  WATER.mat = m; return m;
}
const matCache = new Map();
function zmat(kind, tint = 0xffffff) {
  const k = kind + ':' + tint; if (matCache.has(k)) return matCache.get(k);
  let m;
  switch (kind) {
    case 'wall': case 'wallD': m = withBake(new THREE.MeshStandardMaterial({ map: TEX[kind], bumpMap: TEX[kind], bumpScale: .9, roughness: .88, color: tint })); break;
    case 'floor': case 'floorD': { const t = kind === 'floor' ? TEX.carpet : TEX.carpetD; m = withBake(new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 2.0, roughness: 1, color: tint })); } break;
    case 'ceil': case 'ceilD': m = withBake(new THREE.MeshStandardMaterial({ map: TEX[kind], bumpMap: TEX[kind], bumpScale: 1.2, roughness: .95, color: tint })); break;
    case 'base': m = withBake(new THREE.MeshStandardMaterial({ color: 0x4f3f22, roughness: .6 })); break;
    case 'tile': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.tile, bumpMap: TEX.tile, bumpScale: 1.2, roughness: .3, envMap: ENV, envMapIntensity: .25 })); break;
    case 'ptile': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.tile, bumpMap: TEX.tile, bumpScale: 1.2, color: 0xa9dde3, roughness: .3, envMap: ENV, envMapIntensity: .2 }), sh => {
      addWorldPos(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + causticGLSL)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float under = smoothstep(-0.2, -0.55, vWPos.y);
          vec2 cp = mod(vWPos.xz * 0.9 + vec2(vWPos.y * 0.3), 6.2831853) - 250.0;
          float ca = causticF(cp, uTime * 0.55);
          totalEmissiveRadiance += vec3(0.35, 0.8, 0.95) * clamp(ca, 0.0, 1.5) * under * 0.6 * uCaus * (0.15 + vBake.g);`);
    }); break;
    case 'concrete': case 'whitewall': case 'hotelW': case 'woodpanel': case 'funW': m = withBake(new THREE.MeshStandardMaterial({ map: TEX[kind], bumpMap: TEX[kind], bumpScale: kind === 'concrete' ? 1.4 : .7, roughness: kind === 'woodpanel' ? .6 : .9, color: tint })); break;
    case 'lino': case 'terrazzo': m = withBake(new THREE.MeshStandardMaterial({ map: TEX[kind], bumpMap: TEX[kind], bumpScale: .5, roughness: kind === 'terrazzo' ? .28 : .5, envMap: ENV, envMapIntensity: kind === 'terrazzo' ? .35 : .15, color: tint })); break;
    case 'hotelC': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.hotelC, bumpMap: TEX.hotelC, bumpScale: 1.6, roughness: 1, color: tint })); break;
    case 'asphalt': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.asphalt, bumpMap: TEX.asphalt, bumpScale: 1.5, roughness: .92, color: tint })); break;
    case 'ceilC': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.ceilC, bumpMap: TEX.ceilC, bumpScale: 1.2, roughness: .95, color: tint })); break;
    case 'pipe': m = withBake(new THREE.MeshStandardMaterial({ color: 0x7c6f5c, metalness: .5, roughness: .5 })); break;
    case 'rust': m = withBake(new THREE.MeshStandardMaterial({ color: 0x6b4a32, metalness: .35, roughness: .8 })); break;
    case 'car': m = withBake(new THREE.MeshStandardMaterial({ color: tint, metalness: .45, roughness: .4, envMap: ENV, envMapIntensity: .4 })); break;
    case 'glass': m = withBake(new THREE.MeshStandardMaterial({ color: 0x1c2426, metalness: .2, roughness: .08, envMap: ENV, envMapIntensity: 1 })); break;
    case 'bed': m = withBake(new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 1 })); break;
    case 'green': m = withBake(new THREE.MeshStandardMaterial({ color: 0x3c5a34, roughness: .9 })); break;
    case 'peel': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.peel, transparent: true, alphaTest: .3, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); break;
    case 'footprint': m = new THREE.MeshBasicMaterial({ map: TEX.footprint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0x6a6050 }); break;
    case 'ceilT': m = withBake(new THREE.MeshStandardMaterial({ color: 0xd9dedd, roughness: .7 })); break;
    case 'frame': m = withBake(new THREE.MeshStandardMaterial({ color: 0x8a877c, metalness: .3, roughness: .5 })); break;
    case 'metal': m = withBake(new THREE.MeshStandardMaterial({ color: 0x6d6e68, metalness: .4, roughness: .55 })); break;
    case 'wood': m = withBake(new THREE.MeshStandardMaterial({ map: TEX.crate, roughness: .85 })); break;
    case 'card': m = withBake(new THREE.MeshStandardMaterial({ color: 0xa88a5a, roughness: .95 })); break;
    case 'drywall': m = withBake(new THREE.MeshStandardMaterial({ color: 0xd2cdbb, roughness: .9 })); break;
    case 'cloth': m = withBake(new THREE.MeshStandardMaterial({ color: 0x5a5f6a, roughness: 1 })); break;
    case 'plastic': m = withBake(new THREE.MeshStandardMaterial({ color: 0xdcd8cc, roughness: .45 })); break;
    case 'darkp': m = withBake(new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: .5 })); break;
    case 'door': m = withBake(new THREE.MeshStandardMaterial({ color: 0xb8a684, roughness: .7 })); break;
    case 'brass': m = withBake(new THREE.MeshStandardMaterial({ color: 0xb59a52, metalness: .7, roughness: .35 })); break;
    case 'sofa': m = withBake(new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: .95 })); break;
    case 'hole': m = new THREE.MeshBasicMaterial({ color: 0x050403, polygonOffset: true, polygonOffsetFactor: -2 }); break;
    case 'stain': m = new THREE.MeshBasicMaterial({ map: TEX.stain, transparent: true, depthWrite: false, color: 0x302008, polygonOffset: true, polygonOffsetFactor: -2 }); break;
    case 'exit': m = new THREE.MeshBasicMaterial({ map: TEX.exit, color: new THREE.Color(2.2, 2.6, 2.2) }); break;
    case 'water': if (S.water !== 'Простая') { m = waterMaterial(); break; } // fallthrough → простая вода
    case 'puddle': case 'waterLite': {
      const deep = kind !== 'puddle';
      m = new THREE.MeshPhysicalMaterial({ color: deep ? 0x5aaab4 : 0x6a6040, roughness: .04, metalness: 0, transparent: true, envMap: ENV, envMapIntensity: deep ? .9 : .5, side: THREE.DoubleSide, depthWrite: false, ior: 1.33, polygonOffset: !deep, polygonOffsetFactor: -1 });
      const amp = deep ? 1 : .3, a0 = deep ? .42 : .2;
      withBake(m, sh => {
        addWorldPos(sh);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WAVES_GLSL)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
            { vec2 g = waveGrad(vWPos.xz, uTime) * ${amp.toFixed(2)}; vec3 nW = normalize(vec3(-g.x, 1.0, -g.y)); if (!gl_FrontFacing) nW = -nW; normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }`)
          .replace('#include <opaque_fragment>', `
            float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 4.0);
            gl_FragColor = vec4(min(outgoingLight, vec3(6.0)), mix(${a0.toFixed(2)}, 0.97, fres));`);
      });
      m.customProgramCacheKey = () => 'water' + kind;
    } break;
  }
  matCache.set(k, m); return m;
}
// светящиеся части светильников: один материал на (тип, цвет); яркость — instanceColor
const PANEL = {};
function panelMat(color) {
  const k = 'c' + color; if (PANEL[k]) return PANEL[k];
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff }); m.userData.base = new THREE.Color(color).multiplyScalar(4.0); m.color.copy(m.userData.base);
  return PANEL[k] = m;
}
const HAZE_MAT = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(1.0, .88, .62) }, uDensity: { value: .05 }, uStrength: { value: .026 } },
  vertexShader: `attribute float aH; attribute float aU; attribute float aInt; varying float vU; varying float vH; varying float vI; varying vec3 vN; varying vec3 vV;
    void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0); vH = aH; vU = aU; vI = aInt;
      vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = cameraPosition - wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uDensity; uniform float uStrength; varying float vH; varying float vU; varying float vI; varying vec3 vN; varying vec3 vV;
    void main(){ float d = length(vV); vec3 V = vV / d; float edge = abs(dot(normalize(vN), V));
      float side = sin(3.14159 * clamp(vU, 0.0, 1.0));
      float a = pow(1.0 - vH, 2.0) * side * side * edge * uStrength * vI;
      a *= exp(-d * uDensity * 0.7) * smoothstep(0.6, 2.5, d);
      gl_FragColor = vec4(uColor * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
});
const HAZE_MATS = new Map();
function hazeMat(color) {
  let m = HAZE_MATS.get(color); if (m) return m;
  m = HAZE_MAT.clone(); m.uniforms.uColor.value = new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), .1); m.uniforms.uDensity = HAZE_MAT.uniforms.uDensity; m.uniforms.uStrength = HAZE_MAT.uniforms.uStrength;
  HAZE_MATS.set(color, m); return m;
}
const hazeGeoCache = new Map();
function hazeGeo(h) {
  if (hazeGeoCache.has(h)) return hazeGeoCache.get(h);
  const t = [.62, .32], b = [1.55, 1.25], pos = [], aH = [], aU = [];
  const T = (sx, sz) => [sx * t[0], 0, sz * t[1]], B = (sx, sz) => [sx * b[0], -h, sz * b[1]];
  for (const [p, q] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]]) {
    const v = [T(...p), T(...q), B(...q), B(...p)];
    for (const i of [0, 2, 1, 0, 3, 2]) { pos.push(...v[i]); aH.push(i >= 2 ? 1 : 0); aU.push(i === 0 || i === 3 ? 0 : 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1)); g.setAttribute('aU', new THREE.Float32BufferAttribute(aU, 1));
  g.computeVertexNormals(); hazeGeoCache.set(h, g); return g;
}
const PANEL_GEO = new THREE.BoxGeometry(1.2, .03, .6);
// типы светильников: размер светящейся части, рамка, висит ли на подвесе
const FIXTYPES = {
  panel:  { geo: PANEL_GEO, frame: [.65, .35], drop: .055, haze: true },
  tube:   { geo: new THREE.BoxGeometry(1.5, .05, .1), frame: [.8, .09], drop: .25, haze: true, hang: true },
  bulb:   { geo: new THREE.SphereGeometry(.13, 12, 8), frame: [.14, .14], drop: .32, hang: true },
  sodium: { geo: new THREE.BoxGeometry(.7, .06, .3), frame: [.4, .2], drop: .12, haze: true },
  dome:   { geo: new THREE.SphereGeometry(.28, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), frame: [.3, .3], drop: .01 },
};
for (const k in FIXTYPES) FIXTYPES[k].geo.userData.shared = true;

