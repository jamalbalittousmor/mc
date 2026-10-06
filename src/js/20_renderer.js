// =====================================================================
//  RENDERER / SCENE
// =====================================================================
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('app').appendChild(renderer.domElement);
const MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0e0c07, 0.05);
scene.background = scene.fog.color;
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 120);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x5a4e30, 0x120e06, 0.06));
const U = { time: { value: 0 }, caustic: { value: 1 }, bake: { value: 1 } };
const hfovToV = (h, aspect) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / aspect));
