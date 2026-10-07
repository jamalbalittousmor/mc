// Пример: новый предмет с собственным действием, HUD-элемент, событие, консольная команда.
Backrooms.mod({
  id: 'example.radio', name: 'Карманное радио', version: '1.0.0',
  description: 'Радио ловит обрывки передач. Иногда — слишком близко.',
  init(api) {
    const { pick, rand } = api.util;
    const LINES = ['…уровень ноль… повторяю… не заходите в…', '…если вы слышите это — оставайтесь на свету…', '…генератор в секторе… топливо…', '…*шипение*… кто-нибудь…', '…выход находится там, где гул тише…'];
    api.items.register('radio', {
      name: 'Радиоприёмник', icon: '📻', stack: 1, desc: 'ЛКМ — покрутить ручку. Работает без батареек. Почему-то.',
      mesh: ['box', [.16, .1, .06], 0x3a3530], loot: .015, lootZones: { office: 3, industrial: 2 },
      onUse(api) { api.audio.crackle(null, 1.2); setTimeout(() => api.say('📻 ' + pick(LINES), 5), 900); api.data.uses = (api.data.uses || 0) + 1; return false; }, // false = не расходуется
    });
    api.events.register('radio_voice', {
      w: () => api.inv.count('radio') ? 1.2 : 0,
      run() { api.audio.crackle(null, 2); api.audio.voice(null); api.say('📻 Радио само включилось. Голос называет твоё имя.', 5); api.engine.addPanic(.1); },
    });
    const hud = api.ui.hud('radio');
    api.on('update', () => { const a = api.inv.selected(); hud.textContent = a && a.id === 'radio' ? `📻 включений: ${api.data.uses || 0}` : ''; });
    api.commands.register('radio', { help: 'выдать радио', run: () => (api.inv.add('radio', 1), 'держи') });
    return { LINES }; // экспорт для других модов: api.mod('example.radio').LINES
  },
});
