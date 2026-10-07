# Backrooms v4 — моддинг

Мод — это обычный `.js`-файл в папке `Mods` рядом с `index.html`.

> **GitHub Pages / любой статический хостинг** не отдаёт листинг папок, поэтому мод обязательно нужно вписать в `Mods/mods.js`. Pages кэширует файлы ~10 минут.

## Исходники игры
`index.html` собирается из `src/` — так удобнее читать и менять движок:
- `src/js/NN_имя.js` — модули, склеиваются **по порядку имён** в один `<script type="module">` (общая область видимости, импортов между файлами нет);
- `src/style.css`, `src/shell.html` — стили и разметка;
- `node tools/build.mjs` — собрать `index.html`; `node tools/watch.mjs` — пересобирать при каждом сохранении.

Ключевые модули: `02_settings` (настройки и таблица баланса `BAL`), `10_worldgen` (зоны, планировки, ямы/помосты), `32_chunks` (геометрия и наполнение чанка), `33_world_objects` (двери, выключатели, фонтанчики, телефоны, ящики), `40_player` (контроллер), `60_director` / `63_watcher` (хоррор), `80_modapi` (API модов).

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
| `api.items` | `name, icon (emoji), svg ('<svg…>' — рекомендуется, не зависит от шрифтов), iconUrl, stack, desc, mesh:['box',[w,h,d],color]\|['cyl',[r,h],color], use:{thirst:+,...}, onUse(api,{slot})→true=расходовать, loot:вес, lootZones:{zone:множ}` |
| `api.zones` | параметры зоны (`H, layout, roomMax, gapP, openP, extraP, halfP, lowP, loopP, doorP, doorObjP, switchP, fountainP, pitP, stageP, lightGrid, pillarP, lightP, brokenP, flickerP, dirt (0..1, грязь/разруха), roomTypes:[[тип,вес]], color, tint, carpet, fog:[цвет,плотность], mat:'yellow'\|'tile', flood, weight`). `layout`: `'rooms'\|'maze'\|'open'\|'office'\|'noise'` или функция `(L, zone, rng, cx, cz)` (см. `LAYOUTS` в `10_worldgen.js`). Зона со старым `wallP` без `layout` получает `'noise'` |
| `api.structures` | `zones:[...], chance:число\|fn(zone,gx,gz), salt, cell(ctx, c, api)` или `chunk(ctx, api)`. В `ctx`: `gb(kind).box(...)`, `colBox(...)`, `spawn(id,pos,key)`, `add(object3d)`, `rng`, `zone`, `claim/free`, `layout` (комнаты/ямы чанка), `used` (занятые мебелью клетки), `floorY(x,z)`, `featureAt(x,z)`, `interactable(collider, {prompt, use}, key)` — свой интерактивный объект на кнопку E (состояние можно хранить в `api.engine.WorldObj.st(key, init)`, оно сохраняется). В `c`: `gx,gz,mx,mz,rng,key(i)` |
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

## Баланс
`api.engine.BAL` — все «ручки» баланса (скорость голода/жажды/сна в минутах, влияние света на рассудок, шанс лута и записок, расстояние до выхода, частота событий, когда появляется Наблюдатель…). Читаются каждый кадр — можно менять в `init`.

## Хуки и фильтры
- `api.on(name, fn, {priority})`. События: `update`, `chunk:load/unload`, `world:new`, `game:load`, `level:exit`, `item:use` / `key:down` (можно отменить через `ev.cancel = true`), `item:pickup`, `craft`, `quest:done`, `player:step`, `build:placed/removed`, `door:toggle`, `chalk:drawn`, `fixture:changed`, `director:event`, `survival:update`, `piece:create`, `registry:add`, а также любые события через `api.emit`.
- `api.filter(name, fn(value, ctx))` — цепочка изменения значений: `player:speed`, `survival:rates`, `loot:weights`, `container:loot`, `ui:objectives`.
- Шина движка `api.engine.bus.on(name, fn)`: `door:toggle`, `switch:toggle`, `fountain:drink`, `phone:answer`, `phone:missed`, `container:search`, `watcher:spawn/seen/contact`, `fixture:changed`, `note:read`, `shelter:enter`, `director:event`.
- Новые события режиссёра (можно патчить через `api.events`): `world_door_slam`, `door_knock`, `switch_off`, `phone_ring`, `watcher`.

## Остальное
- `api.data` — объект мода, сохраняется вместе с игрой.
- `api.settings(defaults, {schema})` — настройки мода, хранятся отдельно и появляются в панели «Настройки → Моды».
- `api.ui`: `hud(id, html)`, `objective(fn)`, `panel(title, html, buttons)`, `menuButton`, `notify`, `style(css)`.
- `api.provide(name, obj)` / `api.require(name)` — общие сервисы между модами; `api.mod(id)` — exports другого мода.
- `api.inv`, `api.power.at(pos)`, `api.quest.count(key, n)`, `api.audio`, `api.util`, `api.engine` — прямой доступ к сцене, физике, игроку, чанкам и прочему (на свой риск). Там же: `BAL, WorldObj, Watcher, LAYOUTS, layoutOf, floorY, featureAt, fixtureLit, roomCells, switchOff, iconHtml, ICON_SVG, pickupToast, bus`.

Если мод бросает исключение в `init`, он выключается, а его контент откатывается. Если он сыпет ошибками в рантайме, его обработчики отключаются после 25 ошибок. Остальные моды продолжают работать.

Примеры лежат в `Mods/`: радио (предмет, событие, HUD), VHS (эффект и настройки), автоматы (структура, взаимодействие, данные, патч, фильтр, зависимость), холод (новая шкала, фильтры, задание).

## Новое в 5.0
- **Мебель**: `ctx.furn(kind, name, key, () => { ...gb/colBox... })` в структурах — объект становится разбираемым; `api.furn.at(hit.collider)` → запись `{kind, name, x, y, z, gone}`, `api.furn.remove(rec)` убирает геометрию, коллайдеры и тень (запоминается в сохранении).
- **Тени запечённого света**: `ctx.addOccluder([x0,y0,z0,x1,y1,z1])`; лампы — `E.addLamp({x,y,z,color,mult,on})` / `E.removeLamp(l)`; `E.queueRebake(x, z, r)`.
- **Записки**: `api.notes.register(id, { kind: 'lore'|'guide', order, t, b, hidden })`, `api.notes.unlock(id)`, `api.notes.give(id)` (показать окно), `api.notes.has(id)`.
- **Задания по главам**: `api.quests.chapter('ch7', { title, order, desc })`, у задания поле `chapter`.
- **Удержание E**: `test(h)` взаимодействия или `prompt(m)` машины может вернуть объект `{ text, hold: секунды, holdKey, onHoldTick(dt,t), run() }`.
- **Сеть питания**: машины с `power` + `producing(m)` — источники, с `relay: true` — реле; соседние узлы (в пределах `range`) объединяются, мощность внутри сети суммируется. `api.power.at(p)`.
- **Сервисы**: `api.provide(name, obj)` / `api.require(name)` — так `li.industry` отдаёт конструктор машин с очередью `li.proc.proc(id, { name, needPower, fuel, recipes: [[id, name, in, out, sec]], build })`.
- **Зоны**: `wallK/floorK/ceilK` (виды материалов), `fix` (panel/tube/bulb/sodium/dome), `haze`, `minLevel`, `levelGrow`, `layout: 'rooms'|'maze'|'open'|'corridor'`.
- **Концовка**: `api.escape(text)` — побег, затем «Новая игра+».
- **Настройки мода**: `api.settings(defaults, { schema: { key: { label, min, max, step, options, help } } })` — показываются в меню «Моды».
- События: `world:clear` (мир очищен), `chunk:load/unload`, `furn:removed`, `li:salvaged`, `director:event`, `game:escape`.
