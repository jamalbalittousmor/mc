// Пример: графический эффект (пост-обработка) + настройки мода + перехват клавиши.
Backrooms.mod({
  id: 'example.vhs', name: 'VHS-фильтр', version: '1.0.0', description: 'Плёночные полосы и дрожание кадра. Клавиша V — вкл/выкл.',
  init(api) {
    const cfg = api.settings({ enabled: false, strength: .6 }, { schema: { enabled: { label: 'Включён' }, strength: { label: 'Сила', min: 0, max: 1, step: .05 } } });
    api.effects.register('vhs', {
      uniforms: { uStr: { value: cfg.strength } },
      enabled: () => cfg.enabled,
      update(u) { u.uStr.value = cfg.strength; },
      fragment: `uniform sampler2D tDiffuse; uniform float uTime, uStr; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
        void main(){ vec2 uv = vUv; float line = floor(uv.y * 240.0);
          uv.x += (h(line + floor(uTime * 24.0)) - 0.5) * 0.004 * uStr + sin(uv.y * 30.0 + uTime * 3.0) * 0.0015 * uStr;
          vec3 c = vec3(texture2D(tDiffuse, uv + vec2(0.002 * uStr, 0.0)).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - vec2(0.002 * uStr, 0.0)).b);
          c *= 1.0 - 0.12 * uStr * step(0.5, fract(uv.y * 240.0));
          float band = smoothstep(0.0, 0.02, abs(fract(uv.y - uTime * 0.07) - 0.5)); c = mix(c * 1.25, c, mix(1.0, band, uStr));
          gl_FragColor = vec4(c, 1.0); }`,
    });
    api.on('key:down', e => { if (e.code === 'KeyV') { cfg.enabled = !cfg.enabled; api.say('VHS ' + (cfg.enabled ? 'вкл' : 'выкл'), 1.5); e.cancel = true; } });
  },
});
