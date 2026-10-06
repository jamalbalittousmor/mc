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
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aLight;\nvarying vec3 vBake;')
      .replace('#include <common>', '#include <common>\nuniform float uBreath; uniform float uTimeB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = aLight;\nif (uBreath > 0.001 && abs(normal.y) < 0.5) { vec3 wpB = (modelMatrix * vec4(transformed, 1.0)).xyz; transformed += normal * uBreath * 0.06 * sin(wpB.x * 0.7 + wpB.z * 0.55 + wpB.y * 1.6 + uTimeB * 1.3) * (0.6 + 0.4 * sin(uTimeB * 0.4 + wpB.y)); }');
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
function waterMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .035, metalness: 0, transmission: 1, thickness: 1.6, ior: 1.333,
    attenuationColor: new THREE.Color(0x48b8c6), attenuationDistance: 2.4, specularIntensity: 1, specularColor: new THREE.Color(1, 1, 1),
    envMap: ENV, envMapIntensity: 1.15, side: THREE.DoubleSide,
  });
  m.onBeforeCompile = sh => {
    addWorldPos(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + WAVES_GLSL + causticGLSL)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 g = waveGrad(vWPos.xz, uTime) * 1.25; vec3 nW = normalize(vec3(-g.x, 1.0, -g.y)); if (!gl_FrontFacing) nW = -nW; normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec2 cp = mod(vWPos.xz * 0.7, 6.2831853) - 250.0; float ca = causticF(cp, uTime * 0.4);
          totalEmissiveRadiance += vec3(0.25, 0.55, 0.6) * clamp(ca, 0.0, 1.0) * 0.05 * uCaus; }`);
  };
  m.customProgramCacheKey = () => 'waterT';
  return m;
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
const PANEL = {
  warm: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c8).multiplyScalar(4.0) }),
  cool: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f6ff).multiplyScalar(4.3) }),
};
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
const HAZE_MAT_COOL = HAZE_MAT.clone(); HAZE_MAT_COOL.uniforms.uColor.value = new THREE.Color(.75, .9, 1.0); HAZE_MAT_COOL.uniforms.uDensity = HAZE_MAT.uniforms.uDensity; HAZE_MAT_COOL.uniforms.uStrength = HAZE_MAT.uniforms.uStrength;
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

