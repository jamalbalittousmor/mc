// =====================================================================
//  DUST MOTES
// =====================================================================
const DUST_N = 700, dustBox = 12;
const dustGeo = new THREE.BufferGeometry(), dp = new Float32Array(DUST_N * 3), ds = new Float32Array(DUST_N);
for (let i = 0; i < DUST_N; i++) { dp[i * 3] = rand(-1, 1) * dustBox; dp[i * 3 + 1] = rand(0, 4.5); dp[i * 3 + 2] = rand(-1, 1) * dustBox; ds[i] = Math.random(); }
dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dustGeo.setAttribute('aS', new THREE.BufferAttribute(ds, 1));
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uCam: { value: new THREE.Vector3() }, uPow: POWER },
  vertexShader: `attribute float aS; uniform float uTime; uniform vec3 uCam; uniform float uPow; varying float vA;
    void main(){ vec3 p = position; p.x += sin(uTime * 0.11 + aS * 40.0) * 0.6; p.y += sin(uTime * 0.07 + aS * 17.0) * 0.4; p.z += cos(uTime * 0.09 + aS * 23.0) * 0.6;
      p.xz = uCam.xz + mod(p.xz - uCam.xz + ${dustBox.toFixed(1)}, ${(dustBox * 2).toFixed(1)}) - ${dustBox.toFixed(1)};
      vec4 mv = modelViewMatrix * vec4(p, 1.0); float d = -mv.z;
      vA = smoothstep(${dustBox.toFixed(1)}, 3.0, d) * smoothstep(0.3, 1.2, d) * (0.4 + 0.6 * aS) * (0.15 + 0.85 * uPow);
      gl_PointSize = (1.0 + aS * 2.0) * 9.0 / max(d, 0.3); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA * 0.3; gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * a, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; dust.userData.noAO = true; scene.add(dust);


