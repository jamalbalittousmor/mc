// =====================================================================
//  SETTINGS (persisted) + BALANCE (tunable numbers in one place)
// =====================================================================
const S = {
  sensitivity: 1.0, fov: 90, volume: 0.8, ambience: 0.55, quality: 'Среднее', adaptive: true, ao: true, bloom: 0.38, grain: 0.035,
  shadows: true, headbob: true, halluc: 1.0, steps: 0.45, viewdist: 46, fpsCap: 0, uiScale: 1.1, hints: true, water: 'Красивая',
};
const S_DEFAULT = { ...S };
// v3: новые значения по умолчанию (фоновый гул снова включён). Старые настройки переносятся, кроме гула.
try {
  const v3 = localStorage.getItem('backrooms.settings.v3');
  if (v3) Object.assign(S, JSON.parse(v3));
  else { const old = JSON.parse(localStorage.getItem('backrooms.settings.v2') || '{}'); delete old.ambience; Object.assign(S, old); }
} catch (e) {}
const saveSettings = () => { try { localStorage.setItem('backrooms.settings.v3', JSON.stringify(S)); } catch (e) {} };
const QUALITY = { 'Низкое': { pr: 0.55, shadow: 512, lights: 3 }, 'Среднее': { pr: 0.8, shadow: 1024, lights: 5 }, 'Высокое': { pr: 1.0, shadow: 2048, lights: 7 } };

// Все «ручки» баланса. Моды могут менять значения напрямую (api.engine.BAL) — они читаются каждый кадр.
const BAL = {
  // минуты, за которые показатель падает со 100 до 0 при обычной ходьбе
  thirstMin: 24, hungerMin: 38, energyMin: 34,
  sprintDrain: 1.5,            // множитель расхода при беге
  // рассудок, единиц в секунду
  sanityDark: -.42, sanityDim: -.16, sanityLit: .06, sanityLitHigh: -.025, sanityLitCap: 55, sanityShelter: .45, sanityPanic: -.3,
  graceSec: 90, graceMul: .6,     // первые N секунд уровня потеря рассудка ×graceMul
  darkLevel: .08, dimLevel: .22, // пороги освещённости
  regenHealth: .07,            // хп/с, когда сыт и напоен
  starveDmg: .3, thirstDmg: .45, drownDmg: 9,
  oxygenSec: 18,
  flashMinutes: 7,             // заряда фонарика хватает на N минут
  lootCell: .045,              // шанс предмета на полу в клетке
  noteCell: .011,              // шанс записки в клетке (дальше 28 м от старта)
  notesNeeded: 3,
  exitDist: [150, 210],        // расстояние до выхода на 1 уровне, м
  exitDistPerLevel: 35,
  levelDark: .06,              // насколько каждый следующий уровень темнее
  directorBase: [18, 36],      // пауза между событиями режиссёра, с
  watcherMinT: 150,            // через сколько секунд на уровне может появиться Наблюдатель
};
