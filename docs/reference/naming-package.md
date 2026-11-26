# Структура и именование UI — пакет канала, тесты, генератор

**Назначение:** пакет канала, внутренности пакета, место тестов и фикстур, генератор видов UI; продолжение справочника [Структура и именование UI](./naming.md).

---

## 3. Пакет канала

Пакеты каналов в репо — `chat-ui`, `tg-bot`, `web-ui`; входы — `dmg-ui/<канал>` и `dmg-ui/<канал>/testing`. Учебный проект в пакетах каналов не лежит: его вход — `dmg-ui/example` (D-UI-121). Виды генератора — отдельный пакет-каталог `packages/gen` без своего `package.json`: вход `dmg-ui/dmg-core` → `packages/gen/src/index.ts`, из пакетов он знает только `dmg-core/gen` (§6, [D-UI-123](../decisions.md)).

```
packages/<канал>/
  src/                              вход dmg-ui/<канал>; каталоги по ответственности
    <тема>/<файл>.ts                один класс на файл; <файл>.types.ts, <файл>.const.ts, <файл>.test.ts рядом
    graph/rules/<имя>.rule.ts       реализация GraphRule, id правила в классе, тест <имя>.rule.test.ts
    index.ts
  testing/                          вход dmg-ui/<канал>/testing
    index.ts
    [<порты>/]memory-<порт>.ts      подставные порты (`Memory*`; `messengers/memory-messenger.ts`, `bot-api/memory-bot-api.ts`)
    <тема>/                         проверка единицы (`limits/` — `ExampleLimits`, CH-01)
    <имя>.ui-app.ts                 приложение UI для тестов канала (`routed-pages`)
    <помощник>.ts                   помощник тестов канала (сцена графа, часы)
    <тема>-story.test.ts            сквозной сценарий канала на подставном порте
packages/example/                    учебный проект (вход dmg-ui/example), дерево — [§2](./naming.md#2-дерево-проекта)
acceptance/                          приёмка на двух каналах
browser/                             `*.browser.test.ts`, `bun run browser`, вне `bun test`
checks/                              проверки репо, не поставляются
```

Канал определяет папка канала модуля: представление Telegram, перекрывающее общее представление `chat`, — тоже `<имя>.view.ts`, но в `frontend/<m>/telegram/`.

## 4. Внутренности пакета

| Суффикс | Назначение |
|---|---|
| `.rule.ts` | реализация `GraphRule`; класс `<Имя>Rule`, ID правила в классе, тест `<имя>.rule.test.ts`; не путать с `.rules.ts` домена (`RulesDef`) |
| `.const.ts` | экспортируемые константы файла рядом с классом; пара `.types.ts` |
| `.types.ts`, `.const.ts` у файла вида | без суффикса вида: `examples-by-schema.rule.ts` → `examples-by-schema.types.ts` |
| `-schema.ts` | не суффикс: имя по содержимому — схемы valibot внешнего провода (`capabilities-schema.ts`, `bot-api-schema.ts`) |
| `.fixture.ts` | помощник тестов внутри пакета (как в `dmg-core`, TST-07) |
| `.browser.test.ts` | сценарий в Chrome; `bun run browser`, `bun test` его пропускает (`bunfig.toml`, D-UI-103) |
| `<файл>.<грань>.test.ts` | грань теста файла: канал, зона, режим |

Файл без вида называется kebab-именем своего класса или функции, дефис — часть имени, а не суффикс: `chat-views.ts` → `ChatViews`, `profile-codes.ts` → `profileCodes`, `channel-word-scanner.ts` → `ChannelWordScanner`. Реестр кода модуля — `<m>-codes.ts`, сборка реестров оболочки — `<имя>-codes.ts`, `<имя>-views.ts`.

## 5. Тесты и фикстуры

Тест лежит рядом со своим файлом; наличие теста `NM-01` не требует — только место и форму. Допустимые формы:

- `<файл>.test.ts` — тест файла (`task-list.scode.test.ts`, `entry-point.rule.test.ts`);
- `<файл>.<грань>.test.ts` — грань теста файла, грань — kebab-слово без точки (`example-tokens.guard.test.ts`, `package-manifest.web-ui.test.ts`);
- `<тема>-<что>.test.ts` — тест темы: `<тема>` — собственный дефисный префикс имени теста, и в том же каталоге есть голова — `<тема>.ts` или `<тема>.<вид>.ts` (`conversation-help.test.ts` при `conversation.ts`, `cart-list-help.test.ts` при `cart-list.screen.ts`). Головой не служат `.types.ts`, `.const.ts`, `.fixture.ts`, `.test-kit.ts`, тесты и файлы-сводки `.ui-module.ts`, `.set.ts`: иначе `<m>.ui-module.ts` дал бы голову любому `<m>-….test.ts` в папке модуля. Префикс соседних файлов тему не задаёт — `cart-sync.test.ts` при одних `cart-host.ts` и `cart-client.ts` не по форме;
- `readme.test.ts` — проверка README своего каталога или каталога выше (`runners/web/readme.test.ts` → `runners/web/README.md`);
- сквозной сценарий без одного файла — только прямо в каталоге `testing/`, `acceptance/`, `browser/` или `checks/` (не в его подкаталоге); сценарий канала — `<тема>-story.test.ts` (`telegram-story.test.ts`). `<имя>.story.test.ts` — только тест файла `<имя>.story.ts`.

Место фикстур и снимков:

- Снимки — `__snapshots__/` рядом с тестом.
- Фикстуры ядра: публичные — вход `dmg-ui/testing/fixtures` ([fixtures.ts](../../packages/core/testing/fixtures.ts), D-UI-34, D-UI-69); внутренние — `packages/core/testing/ui-*.fixture.ts`.
- Подставные порты — `Memory*` в `testing/` канала (`MemoryMessenger`, `MemoryBotApi`, `MemoryPageHistory`).
- Учебные данные — помощник без вида в папке модуля описания (`platform/ui/todo/shared/example-tasks.ts`).
- В `monorepo` помощники тестов единицы — только через вход `/testing` пакета-владельца, объявленный зависимостью (как `dmg-ui/testing`); относительный путь в общую папку монорепо после выноса ведёт в никуда (D-108 `dmg-core`).

## 6. Генератор

Виды UI для `dmg-core gen` даёт пакет `gen` репо (вход `dmg-ui/dmg-core`, поставщик в `providers` проекта; [D-UI-123](../decisions.md)). Источник имён — таблица [§1](./naming.md#1-виды-и-суффиксы) (суффикс, базовый класс, имя, папка, парные файлы, точка регистрации) и дерево [§2](./naming.md#2-дерево-проекта): вид создаёт файлы по ним, имя вне таблицы вид не выдумывает. Подробно — [Виды генератора](../guides/gen-kinds.md).

| Вид | Аргументы | Что создаёт |
|---|---|---|
| `ui-module` | `<модуль> [<раннер>…]` | `.ui-module` в `UI/<m>/`, `<m>-codes.ts` и `index.ts` в `FE/<m>/logic/`, `<m>-<канал>.views.ts` и `index.ts` в `FE/<m>/<канал>/` для каналов с шаблоном, `package.json` и `tsconfig.json` единиц, строку в `UI/index.ts`, зависимость раннера |
| `story` | `<модуль> <сторис> <экран>` | `.story` и экран `start` (`.screen`, `.scode`, `.view`) в папке сторис |
| `screen` | `<модуль> <папка> <экран>` | `.screen`, `.scode`, `.view` каналов с шаблоном в `<папка>` (сторис или `shared`) |
| `notification` | `<модуль> <папка> <уведомление>` | `.notification`, `.ncode`, `.view` каналов с шаблоном в `<папка>` |

- **Места и пакеты — из `layers`.** Слои `ui`, `fe-logic` и `fe-<канал>` — ключи секции `layers` в `.dmg/config.json` (`dir` с `{m}`, `package` с `{m}`); `fe-app` и `fe-logic` каналами не считаются.
- **Шаблоны каналов — `chat` и `web`.** Остальной канал (в том числе `telegram` на базе) получает заметку, файлов нет.
- **Правки по маркерам.** Элементы списков модуля и сторис, импорты и реестры вид дописывает по строкам `// gen:imports`, `// gen:exports`, `// gen:screens`, `// gen:stories`, `// gen:notifications`, `// gen:views`, `// gen:codes`; нет маркера — строка печатается «Вставь вручную».
- **Не создаёт:** `set` (набор UI), приложение UI, оболочку раннера и сборки реестров, представления каналов без шаблона, `event` уведомления; `workspaces` корня не правит. Имена и места вид берёт из этой раскладки: смена раскладки здесь — шаблоны вида и тест образца меняются вместе.
- **Памятка для файлов, которых вид не создаёт** — [story-screen-notification-project.md §10](../guides/story-screen-notification-project.md#10-добавить-вид-в-учебный-проект).
