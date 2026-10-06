// =====================================================================
//  SETTINGS PANEL (Tweakpane, persisted)
// =====================================================================
const pane = new Pane({ container: $('settings'), title: 'Настройки' });
const onSet = (fn) => () => { saveSettings(); fn?.(); };
pane.addBinding(S, 'sensitivity', { label: 'Чувствит.', min: .2, max: 3, step: .05 }).on('change', onSet());
pane.addBinding(S, 'fov', { label: 'FOV (гориз.)', min: 70, max: 120, step: 1 }).on('change', onSet());
pane.addBinding(S, 'volume', { label: 'Громкость', min: 0, max: 1, step: .01 }).on('change', onSet());
pane.addBinding(S, 'ambience', { label: 'Фон. гул', min: 0, max: 1, step: .01 }).on('change', onSet());
pane.addBinding(S, 'halluc', { label: 'Галлюцинации', min: 0, max: 1.5, step: .05 }).on('change', onSet());
pane.addBinding(S, 'quality', { label: 'Качество', options: { 'Низкое': 'Низкое', 'Среднее': 'Среднее', 'Высокое': 'Высокое' } }).on('change', onSet(applyQuality));
pane.addBinding(S, 'adaptive', { label: 'Адапт. разрешение' }).on('change', onSet(applyQuality));
pane.addBinding(S, 'ao', { label: 'AO (GTAO)' }).on('change', onSet(applyQuality));
pane.addBinding(S, 'shadows', { label: 'Тени фонаря' }).on('change', onSet());
pane.addBinding(S, 'bloom', { label: 'Свечение', min: 0, max: 1.5, step: .01 }).on('change', onSet(applyQuality));
pane.addBinding(S, 'grain', { label: 'Зерно', min: 0, max: .15, step: .005 }).on('change', onSet(applyQuality));
pane.addBinding(S, 'headbob', { label: 'Покачивание' }).on('change', onSet());
pane.addBinding(S, 'steps', { label: 'Шаги (громк.)', min: 0, max: 1, step: .01 }).on('change', onSet());
pane.addBinding(S, 'water', { label: 'Вода', options: { 'Красивая (преломление)': 'Красивая', 'Простая': 'Простая' } }).on('change', onSet(() => { for (const k of [...matCache.keys()]) if (k.startsWith('water')) matCache.delete(k); for (const c of [...chunks.values()]) rebuildChunk(c.cx, c.cz); }));
pane.addBinding(S, 'fpsCap', { label: 'Лимит FPS', options: { 'Без лимита': 0, '30': 30, '60': 60, '90': 90, '120': 120, '144': 144, '165': 165, '240': 240 } }).on('change', onSet());
pane.addBinding(S, 'uiScale', { label: 'Размер интерфейса', min: .8, max: 1.6, step: .05 }).on('change', onSet(applyQuality));
pane.addBinding(S, 'hints', { label: 'Подсказки клавиш' }).on('change', onSet(applyQuality));
pane.addBinding(S, 'viewdist', { label: 'Дальность', min: 28, max: 70, step: 1 }).on('change', onSet());

