# Backrooms v3 — моддинг

Мод — это обычный `.js`-файл в папке `Mods` рядом с `backrooms_v3.html`.

## Как игра находит моды
1. **`Mods/mods.js`** — список файлов (`window.BACKROOMS_MODS = ['a.js', ...]`). Работает при запуске прямо с диска.
2. **Меню → МОДЫ → «Выбрать папку Mods»** (Chrome/Edge). Тогда все `.js` из папки подхватываются сами, перечислять их не нужно. Папка запоминается.
3. **Локальный сервер** (`python -m http.server`): моды берутся из листинга `Mods/`.
4. **«Установить .js»** — файл копируется во встроенную библиотеку браузера (работает везде).

Одинаковые моды из разных источников склеиваются: остаётся старшая версия.

## Шаблон
```js
Backrooms.mod({
  id: 'author.mymod', name: 'Мой мод', version: '1.0.0',
  requires: ['core.industry@>=1.0'],     // жёсткие зависимости (нет — мод выключается с причиной)
  loadAfter: ['other.mod'], loadBefore: [], // мягкий порядок
  conflicts: ['bad.mod'],                // несовместимые: выключается тот, у кого ниже priority
  priority: 0,                           // кто выше — тот побеждает при одинаковых id контента
  init(api) { /* регистрация */ return { /* exports для других модов */ }; },
  postInit(api) { /* после init всех модов */ },
});
```

## Реестры (`register(id, def)`, `patch(id, fn)`, `get`, `all`, `remove`)
Одинаковый id контента от разных модов — не ошибка: побеждает мод с большим `priority`, при равенстве — загруженный позже. Все перекрытия видны в окне «МОДЫ». `patch()` правит чужой контент, даже если тот зарегистрируется позже.

| реестр | def |
|---|---|
| `api.items` | `name, icon, stack, desc, mesh:['box',[w,h,d],color]\|['cyl',[r,h],color], use:{thirst:+,...}, onUse(api,{slot})→true=расходовать, loot:вес, lootZones:{zone:множ}` |
| `api.zones` | параметры зоны (`H, wallP, doorP, pillarP, lightP, brokenP, flickerP, color, tint, carpet, fog:[цвет,плотность], mat:'yellow'\|'tile', flood, weight`) |
| `api.structures` | `zones:[...], chance:число\|fn(zone,gx,gz), salt, cell(ctx, c, api)` или `chunk(ctx, api)`. В `ctx`: `gb(kind).box(...)`, `colBox(...)`, `spawn(id,pos,key)`, `add(object3d)`, `rng`, `zone`, `claim/free`. В `c`: `gx,gz,mx,mz,rng,key(i)` |
| `api.build` | `name, cost:{item:n}, snap, boxes:[[x0,y0,z0,x1,y1,z1,'wood'\|'metal'\|'drywall'\|'cloth'],...], visual(group,ghost,THREE), wall, door, bed, lamp, dynamic, station` |
| `api.machines` | `name, build:{...}, state:{...}, init/tick(m,dt)/interact(m)/prompt(m)→текст, power, range, producing(m)`; `m.state` сохраняется само |
| `api.recipes` | `out:{item:n}, in:{item:n}, station:'workbench'` |
| `api.events` | `w()→вес` или `weight`, `run()→false если не получилось` (вызывает режиссёр) |
| `api.quests` | `title, desc, order, after:[ids], check(api,Q)→true\|0..1\|{n,of}, reward:{item:n}, onDone` |
| `api.interactions` | `priority, test(hit,api)→{text, run}\|null` (кнопка E) |
| `api.stats` | `label, max, initial, color, show, low, tick(dt, st)` — новая шкала в HUD, сохраняется |
| `api.commands` | `help, run(args)` — консоль на клавишу `` ` `` |
| `api.sanity` | эффект безумия: `minT` (0..1, с какой силы безумия доступен), `rare` (может случиться и при полном рассудке), `w` (вес), `dur:[a,b]` сек, `start(e,T)`, `update(e,k,dt)` (k — огибающая 0..1), `end(e)`. Влиять на картинку через `api.engine.SFX` (`fov, hue, dbl, zoom, tunnel, snow, lightMul, muffle, drift, hudGlitch, flashStutter`). Консоль: `sfx <id>`, `sanity <n>` |
| `api.effects` | `fragment` (GLSL с `tDiffuse, uTime, vUv`), `uniforms, enabled(), update(u,dt)` — проход пост-обработки |

## Управление
`api.engine.MOVE` — параметры контроллера (`walk, sprint, crouch, accel, airAccel, friction, stopSpeed, jump, gravity, fallMul, coyote, buffer`), можно менять на лету.

## Хуки и фильтры
- `api.on(name, fn, {priority})`. События: `update`, `chunk:load/unload`, `world:new`, `game:load`, `level:exit`, `item:use` / `key:down` (можно отменить через `ev.cancel = true`), `item:pickup`, `craft`, `quest:done`, `player:step`, `build:placed/removed`, `door:toggle`, `chalk:drawn`, `fixture:changed`, `director:event`, `survival:update`, `piece:create`, `registry:add`, а также любые события через `api.emit`.
- `api.filter(name, fn(value, ctx))` — цепочка изменения значений: `player:speed`, `survival:rates`, `loot:weights`, `ui:objectives`.

## Остальное
- `api.data` — объект мода, сохраняется вместе с игрой.
- `api.settings(defaults, {schema})` — настройки мода, хранятся отдельно и появляются в панели «Настройки → Моды».
- `api.ui`: `hud(id, html)`, `objective(fn)`, `panel(title, html, buttons)`, `menuButton`, `notify`, `style(css)`.
- `api.provide(name, obj)` / `api.require(name)` — общие сервисы между модами; `api.mod(id)` — exports другого мода.
- `api.inv`, `api.power.at(pos)`, `api.quest.count(key, n)`, `api.audio`, `api.util`, `api.engine` — прямой доступ к сцене, физике, игроку, чанкам и прочему (на свой риск).

Если мод бросает исключение в `init`, он выключается, а его контент откатывается. Если он сыпет ошибками в рантайме, его обработчики отключаются после 25 ошибок. Остальные моды продолжают работать.

Примеры лежат в `Mods/`: радио (предмет, событие, HUD), VHS (эффект и настройки), автоматы (структура, взаимодействие, данные, патч, фильтр, зависимость), холод (новая шкала, фильтры, задание).
