// Пример: новая механика — показатель «Тепло», фильтры скорости и расхода, задание.
Backrooms.mod({
  id: 'example.cold', name: 'Холод', version: '1.0.0', description: 'В воде и затопленных секторах тело остывает. Лампы и убежище греют.',
  init(api) {
    const E = api.engine;
    api.stats.register('warmth', {
      label: 'Тепло', max: 100, initial: 100, color: 'rgba(240,160,120,.8)', show: st => st.warmth < 99,
      tick(dt, st) {
        const z = E.zoneAt(E.camera.position.x, E.camera.position.z);
        let d = E.player.swim ? -2.2 : z.flood ? -.35 : z.key === 'pools' ? -.12 : .25;
        if (E.player.inShelter) d += 1.2;
        st.warmth += d * dt;
      },
    });
    api.filter('player:speed', v => v * (E.player.st.warmth < 25 ? .8 : 1));
    api.filter('survival:rates', r => { if (E.player.st.warmth < 40) r.energy *= 1.6; return r; });
    api.ui.objective(() => E.player.st.warmth < 30 ? '<span class="w">▸ Согрейся: убежище со светом</span>' : null);
    api.quests.register('q_cold', { order: 4.5, title: 'Не замёрзнуть', desc: 'переплыви бассейн и согрейся в убежище', after: ['q_shelter'], check: (a, q) => q.get('cold_swim') > 0 && E.player.inShelter, reward: { cloth: 2 } });
    api.on('update', () => { if (E.player.swim) api.quest.count('cold_swim', 0.0001); });
  },
});
