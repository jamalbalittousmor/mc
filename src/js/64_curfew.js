// =====================================================================
//  «ОТБОЙ» — цикл, который связывает выживание, стройку и страх.
//  Раз в 9–14 минут свет во всём уровне трижды мигает (предупреждение),
//  примерно через минуту сеть гаснет на 1–1.5 минуты. Горит только то,
//  что зажёг ты сам: торшеры, фонарик, лампы на генераторе. В темноте
//  в это время охотятся тени (см. 65_shadow). Убежище — главный ответ.
//  Не хардкор: таймер виден в задачах, первый Отбой — через ~11 минут.
// =====================================================================
const CURFEW = {
  state: 'idle', t: 0, next: 660, count: 0, dur: 0, power: 1, blinks: [], survivedInShelter: true, shadowCd: 0,
  interval() { return rand(540, 820) / (1 + Math.min(4, game.level - 1) * .1); },
  darkDur() { return rand(55, 80) + Math.min(40, (game.level - 1) * 8); },
  reset() { this.state = 'idle'; this.t = 0; this.next = 660; this.count = 0; this.power = 1; this.blinks.length = 0; },
  save() { return { next: Math.round(this.state === 'idle' ? this.next : this.interval()), count: this.count }; },
  load(d) { this.state = 'idle'; this.t = 0; this.power = 1; this.blinks.length = 0; this.next = d?.next ?? (game.level > 1 ? rand(240, 400) : 660); this.count = d?.count || 0; },
  // предупреждение: три синхронных мигания + глухой «щелчок» сети
  warn() {
    this.state = 'warn'; this.t = game.level === 1 && this.count === 0 ? 75 : rand(50, 65);
    const t0 = clock.elapsedTime; this.blinks = [0, .55, 1.1].map(d => t0 + .4 + d);
    audio.curfewWarn(); audio.humDetune(-90, 2.5);
    later(1.9, () => say(this.count ? pick(['Свет мигнул трижды. Скоро Отбой.', 'Три мигания. Ты знаешь, что это значит.', 'Опять три раза. Ищи свет. Свой свет.']) : 'Свет во всём здании мигнул трижды — одновременно. Будто кто-то проверяет рубильник.', 5));
    if (!this.count) later(6, () => { unlockNote('g_curfew'); say('В журнале: «Отбой». Найди убежище или зажги свой свет.', 5); });
    bus.emit('curfew:warn', { level: game.level, sec: this.t });
  },
  start() {
    this.state = 'dark'; this.dur = this.t = this.darkDur(); this.survivedInShelter = !!player.inShelter; this.shadowCd = rand(12, 22);
    audio.powerDown(); dir.silence = Math.max(dir.silence, 4);
    later(1.2, () => say(pick(['Отбой. Сеть мертва. Горит только то, что ты зажёг сам.', 'Темно. Везде. Кроме твоего света.', 'Отбой. Где-то в темноте что-то сорвалось с места.']), 5));
    addPanic(player.inShelter ? .05 : .2);
    bus.emit('curfew:start', { level: game.level, sec: this.t });
  },
  end() {
    this.state = 'idle'; this.count++; this.next = this.interval(); this.power = 1;
    audio.powerUp(); for (const o of nearFixtures(16)) flickerFixture(o.f, rand(.6, 2.2));
    const shel = this.survivedInShelter && player.inShelter;
    later(1, () => say(shel ? 'Свет вернулся. В убежище было спокойно — почти.' : pick(['Свет вернулся. Будто ничего и не было.', 'Лампы зажглись разом. Ты всё ещё здесь.']), 4));
    if (shel) player.st.sanity = Math.min(100, player.st.sanity + 6);
    Quests.count('curfew'); if (shel) Quests.count('curfew:shelter');
    bus.emit('curfew:end', { level: game.level, shelter: shel });
  },
};
function updateCurfew(dt) {
  const C = CURFEW;
  if (!game.started || player.dead) return;
  const t = clock.elapsedTime;
  // мигания предупреждения: короткие провалы мощности всей сети
  C.power = 1; for (const b of C.blinks) if (t > b && t < b + .22) C.power = .06;
  if (C.blinks.length && t > C.blinks[C.blinks.length - 1] + .3) C.blinks.length = 0;
  if (C.state === 'idle') {
    if (player.sleeping) return;
    C.next -= dt; if (C.next <= 0 && dir.blackout <= 0) C.warn();
  } else if (C.state === 'warn') {
    C.t -= dt; if (C.t <= 0) C.start();
  } else if (C.state === 'dark') {
    C.t -= dt; C.power = .03;
    if (!player.inShelter) C.survivedInShelter = false;
    if (C.t <= 0) C.end();
  }
}
// строка в задачах: честный таймер (не хардкор)
function curfewObjective(out) {
  const C = CURFEW;
  if (C.state === 'warn') out.push(`<span class="w">▸ Отбой через ${Math.ceil(C.t)} с — убежище или свой свет</span>`);
  else if (C.state === 'dark') out.push(`<span class="w">▸ Отбой: ещё ~${Math.ceil(C.t)} с. Не стой в темноте</span>`);
}
