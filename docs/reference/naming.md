# Структура и именование UI

**Назначение:** как раскладывать и называть файлы фронта: описание (набор UI, UI-модуль, сторис, экран, уведомление), реализации модуля (код экранов и уведомлений, представления канала), общее фронта, оболочку канала и пакеты в `monorepo`. Общие правила кода и имён — те же, что в `dmg-core` (`node_modules/dmg-core/docs/reference/naming.md` §4, правило CODE-01): kebab-case файлов, суффикс вида, тест рядом, `<файл>.types.ts`, PascalCase, `undefined`, `private`. Здесь — только то, что добавляет UI. Почему фронт разложен так — [Слои фронта](../concepts/frontend-layers.md). Образец — учебный проект [packages/example](../../packages/example/src/): описание [platform/ui](../../packages/example/src/platform/ui/), реализации модулей [frontend](../../packages/example/src/frontend/), оболочки [runners](../../packages/example/src/runners/). Проверка имён и места — правило `NM-01`, класс `UiFileNames` (§7).

---

## 1. Виды и суффиксы

Файл — `<имя>.<вид>.ts`: `<имя>` — kebab-case (`task-list`), `name` манифеста — camelCase от него (`taskList`), класс — PascalCase имени и вида (`TaskListScreenDef`). Один суффикс — один вид. Приставка `ui-` — только там, где голое слово занято манифестом домена: `.module` (`ModuleDef`) и `.app` (`AppDef`) принадлежат `dmg-core`, поэтому UI-модуль — `.ui-module`, приложение UI — `.ui-app`. Свободные слова — без приставки: `.set`, `.story`, `.screen`, `.notification`.

Обозначения: `UI` — `platform/ui`, `FE` — `frontend`, `R` — `runners`; `<m>` — папка UI-модуля, `<story>` — папка сторис, `<папка>` — папка сторис или `shared`, `<канал>` — каталог канала проекта (`chat`, `telegram`, `web`). Дерево — §2.

| Вид | Суффикс | Экспорт, база | Имя | Пример (файл → имя) | Папка | Парные файлы | Точка регистрации |
|---|---|---|---|---|---|---|---|
| Набор UI | `.set.ts` | `UiSetDef` | `<Имя>SetDef`; имя набора оканчивается на `Ui` | `example-ui.set.ts` → `ExampleUiSetDef` (`name: 'exampleUi'`) | `UI/` | `UI/index.ts` | `UiAppDef.set`; `UiGraphProvider({ set })` во входе графа; область сборки реестров без приложения — `AppCodeLoaders.ofSet`, `AppChatViews.ofSet`, `AppPageViews.ofSet` |
| UI-модуль | `.ui-module.ts` | `UiModuleDef` | `<Имя>UiModuleDef` | `profile.ui-module.ts` → `ProfileUiModuleDef` | `UI/<m>/`, имя папки = `name` модуля; в корне модуля — только он и папки | реестр кода `FE/<m>/logic/<m>-codes.ts`, реестры представлений `FE/<m>/<канал>/<m>-<канал>.views.ts` | `UiSetDef.modules`; первый аргумент `CodeLoaders.of`, `ChatViews.of`, `PageViews.of` |
| Сторис | `.story.ts` | `StoryDef` | `<Имя>StoryDef` | `check-profile.story.ts` → `CheckProfileStoryDef` | `UI/<m>/<story>/`, имя папки = `<имя>` сторис; `shared` занято | — | `UiModuleDef.stories`; `UiAppDef.stories`; `leads` другой сторис |
| Экран | `.screen.ts` | `ScreenDef` | `<Имя>ScreenDef` | `profile-summary.screen.ts` → `ProfileSummaryScreenDef` | папка своей сторис; экран ≥2 сторис модуля — `UI/<m>/shared/` | `FE/<m>/logic/<папка>/<имя>.scode.ts` + тест; `FE/<m>/<канал>/<папка>/<имя>.view.ts` в каждом канале модуля (у канала на базе — только перекрытие) | `UiModuleDef.screens`; `StoryDef.screens`; вход — `UiAppDef.entries` (`address`) |
| Код экрана | `.scode.ts` | класс от `ScreenCode` | `<Имя>ScreenCode` | `profile-summary.scode.ts` → `ProfileSummaryScreenCode` | `FE/<m>/logic/<папка>/` — тот же путь, что у манифеста в `UI/<m>/` | `<имя>.screen.ts` в описании, `<имя>.scode.test.ts` рядом | `CodeLoader.screen(def, …)` в `CodeLoaders.of(<M>UiModuleDef, [...])` файла `<m>-codes.ts` |
| Уведомление | `.notification.ts` | `NotificationDef` | `<Имя>NotificationDef` | `task-assigned.notification.ts` → `TaskAssignedNotificationDef` | папка сторис или `UI/<m>/shared/` | `FE/<m>/logic/<папка>/<имя>.ncode.ts` + тест; `<имя>.view.ts` в каналах модуля | `UiModuleDef.notifications`; `UiAppDef.notifications` |
| Код уведомления | `.ncode.ts` | класс от `NotificationCode` | `<Имя>NotificationCode` | `task-assigned.ncode.ts` → `TaskAssignedNotificationCode` | `FE/<m>/logic/<папка>/` — тот же путь, что у манифеста | `<имя>.notification.ts` в описании, `<имя>.ncode.test.ts` рядом | `CodeLoader.notification(def, …)` в `CodeLoaders.of` файла `<m>-codes.ts` |
| Представление экрана или уведомления | `.view.ts` | `ScreenPresenter.for` / `PagePresenter.for` / `NotificationPresenter.for` / `PageNotePresenter.for` (или `.of`); проект может иметь свою обёртку, как `ExampleScreenView.for` в `FE/web-kit` | `<Имя>View` | `profile-summary.view.ts` → `ProfileSummaryView` | `FE/<m>/<канал>/<папка>/` — тот же путь, что у манифеста | манифест в описании | `ChatViews.of` / `PageViews.of` в `<m>-<канал>.views.ts`; перекрытие канала на базе — `<m><База>Views.over([...])` |
| Реестр представлений модуля | `.views.ts` | `ChatViews.of` / `PageViews.of` / `.over` | `<m><Канал>Views` | `profile-chat.views.ts` → `profileChatViews` | корень `FE/<m>/<канал>/` | `.view.ts` канала модуля; `index.ts` | вход `index.ts` канала модуля → сборка оболочки (`AppChatViews`, `AppPageViews`) |
| Реестр кода модуля | файл без вида `<m>-codes.ts` | функция, возвращает `CodeLoaders.of(<M>UiModuleDef, …)` | `<m>Codes` | `profile-codes.ts` → `profileCodes` | корень `FE/<m>/logic/` | `<m>-codes.types.ts` (подмены `<M>CodeOverrides`), `index.ts` | вход `index.ts` кода модуля → сборка оболочки (`AppCodeLoaders`) |
| Входы модуля | `index.ts`, `public.ts` | реэкспорт | — | `FE/users/chat/public.ts` → `AccountStatus` | корень `FE/<m>/logic/` и `FE/<m>/<канал>/`; `public.ts` — только у канала | — | `index.ts` — реестр модуля для оболочки (UI-34); `public.ts` — кирпичи для чужих модулей того же канала (UI-32, D-UI-120) |
| Приложение UI | `.ui-app.ts` | `UiAppDef` | `<Имя>UiAppDef` | `example-dialog.ui-app.ts` → `ExampleDialogUiAppDef` | `R/<r>/` | `<имя>.graph.ts`, `<имя>.arch.ts`, сборка реестров | `UiGraphProvider({ apps })` и `apps[].app` поставщика графа канала во входе графа; сборка реестров (`AppCodeLoaders.of(app, …)`, `AppChatViews.of(app, …)`, `AppPageViews.of(app, …)`) |
| Маршруты страничного канала | `.routes.ts` | массив `PageRouteDef` | `<имя>Routes` | `example-pages.routes.ts` → `examplePagesRoutes` | `R/<r>/` | `<имя>.ui-app.ts` | `apps[].routes` `PageGraphProvider` во входе графа; `PageClientSpec.routes` |
| Размещения областей | `.placements.ts` | `readonly PagePlacement[]` | `<имя>Placements` | `example-window.placements.ts` → `exampleWindowPlacements` | `R/<r>/` | — | `PageClientSpec.placements` |
| Привязка субъекта к проводу | `.wire.ts` | `{ toWire, revive }` | `<имя>Wire` | `example-subject.wire.ts` → `exampleSubjectWire` | `R/<r>/` | — | `PageHostSpec.subjectToWire` (`toWire`), `PageClientSpec.reviveSubject` (`revive`) |
| Вход графа (как в `dmg-core`, D-96, D-97) | `.graph.ts` | `GraphApp` — `{ def, providers }`, экспорт по имени и по умолчанию | `<Имя>Graph` | `example-dialog.graph.ts` → `ExampleDialogGraph` | `R/<r>/` | `<имя>.arch.ts`, `<имя>.ui-app.ts` | `def` — `AppDef` домена; `providers` — `UiGraphProvider({ set, apps, channels })` и поставщик графа канала (`apps[].app`, возможности, точки входа, у страничного — `routes`). Импортирует описание и файлы оболочки без реестров: до кода экранов и представлений не доходит (ARC-16 `dmg-core`) |
| Сборка для `arch:check` | `.arch.ts` | `ArchApp` | `<Имя>Arch` | `example-dialog.arch.ts` → `ExampleDialogArch` | `R/<r>/` | `<имя>.graph.ts` | `{ ...<Имя>Graph, project, runners, layers, graphEntry }` — вход `arch:check`; каталоги слоёв фронта — `ArchApp.layers` (§2) |
| Сборка реестров оболочки | файл без вида: `<имя>-codes.ts`, `<имя>-views.ts` | функция, возвращает `AppCodeLoaders` / `AppChatViews` / `AppPageViews` | `<имя>Codes`, `<имя>Views` | `example-dialog-views.ts` → `exampleDialogViews` | `R/` или `R/<r>/` | реестры модулей из их `index.ts` | исполнитель (`ScreenRuntime`), беседа, страничный клиент, `UiNotifier`, превью; модули области — `ModuleRegistries.required(app)` |

`Def` и классы — PascalCase (`<Имя><Вид>Def`, `<Имя>View`, `<Имя>Graph`, `<Имя>Arch`); реестры, коллекции и привязки (`.views`, `.routes`, `.placements`, `.wire`, `<m>-codes.ts`) — значения или функции, а не `Def`, поэтому camelCase от `<имя>` и слово вида. Один файл — один экспорт вида: у файла и у экспорта одно `<имя>` (`task-assigned.view.ts` → `TaskAssignedView`).

`.scode` и `.ncode` — сокращения `ScreenCode` и `NotificationCode`; класс берёт полное слово (`TaskListScreenCode`, не `TaskListScode`).

Манифест, его код и представления — пара по имени и пути в трёх деревьях: `UI/todo/shared/task-list.screen.ts` ↔ `FE/todo/logic/shared/task-list.scode.ts` ↔ `FE/todo/<канал>/shared/task-list.view.ts`. Экран и уведомление различает `Def`-аргумент представления, а не суффикс: у обоих — `.view.ts`.

## 2. Дерево проекта

Форма `single` — оси папками в `src/`; образец — учебный проект. Каталоги слоёв проект называет в `ArchApp.layers` ([D-UI-117](../decisions.md)): `ui`, `fe-app`, `fe-logic`, `fe-<канал>` на каждый канал, `<канал>-kit` на каждый канал; `{m}` — имя UI-модуля.

```
src/
  platform/
    ui/                            описание фронта (слой ui)
      index.ts                     вход описания
      <набор>-ui.set.ts            UiSetDef — состав UI-модулей поверх AppDef домена
      <помощник>.ts                помощник набора без вида (example-subject.ts)
      <m>/                         UI-модуль: раздел или вспомогательный; имя папки = name модуля
        <m>.ui-module.ts           в корне модуля — только манифест модуля и папки
        <story>/                   сторис = цель человека; имя папки = имя сторис
          <story>.story.ts
          <экран>.screen.ts        экран одной сторис
          <имя>.notification.ts
        shared/                    экраны ≥2 сторис модуля, уведомления, помощники модуля
  frontend/
    app/                           необязательно: общее фронта над доменом (fe-app)
    <канал>-kit/                   общее канала без хозяина: кирпичи, тема (<канал>-kit)
    <m>/
      logic/                       код модуля, нейтрально к каналу (fe-logic)
        index.ts                   вход для оболочки: реестр кода
        <m>-codes.ts               CodeLoaders.of(<M>UiModuleDef, [...])
        <m>-codes.types.ts         подмены кода для тестов (<M>CodeOverrides)
        <story>/, shared/          то же дерево, что в описании
          <экран>.scode.ts         пара <экран>.screen.ts по тому же пути
          <имя>.ncode.ts
          <помощник>.ts            помощник кода без вида (task-lines.ts)
      <канал>/                     представления модуля в канале (fe-<канал>)
        index.ts                   вход для оболочки: реестр представлений
        public.ts                  кирпичи для чужих модулей того же канала
        <m>-<канал>.views.ts       ChatViews.of / PageViews.of; канал на базе — <m><База>Views.over([...])
        <story>/, shared/          то же дерево, что в описании
          <экран>.view.ts          пара манифеста по тому же пути
  runners/
    <приложение>-codes.ts          сборка реестров кода (AppCodeLoaders), общая для оболочек
    <r>/                           оболочка канала: процесс
      <имя>.ui-app.ts              приложение UI
      <имя>.graph.ts               вход графа: описание и файлы оболочки без реестров
      <имя>.arch.ts                ArchApp — вход arch:check
      <имя>.routes.ts, .placements.ts, .wire.ts    страничный канал
      <имя>-views.ts               сборка реестров представлений (AppChatViews / AppPageViews)
      main.ts                      точка запуска; транспорт, окружение
```

- Один уровень папок в модуле: сторис внутри сторис нет. Экран, ставший общим для двух сторис, переезжает в `shared/` во всех трёх деревьях.
- Канал на базе (`telegram` поверх `chat`) держит только перекрытия: папки сторис и `shared/` — только с перекрытыми представлениями.
- Каталог `frontend/app` и `<канал>-kit` без файлов не создаётся; слой в `ArchApp.layers` всё равно получает каталог.
- Учебный проект: разделы `todo` и `profile`, вспомогательный `users`; `telegram-kit`, `web-kit`; оболочки `runners/dialog`, `runners/tg-bot`, `runners/web` и общая сборка кода `runners/example-codes.ts`.

### Пакеты в `monorepo`

Те же каталоги — пакеты workspaces `@<scope>/*` с `src/` и `exports` ([D-UI-117](../decisions.md), D-108 `dmg-core`). `fe` (frontend) — пара `be` реализаций бэка: `fe-<m>` не сталкивается с `be-<m>` того же имени.

| Каталог | Пакет | Входы (`exports`) | Зависимости |
|---|---|---|---|
| `platform/ui` | `@<scope>/ui` | `.` | `dmg-ui`, `kernel`, домен; реализаций фронта не объявляет (ARC-16) |
| `frontend/app` | `@<scope>/fe-app` | `.` | `@<scope>/ui`, домен, `dmg-ui` |
| `frontend/<m>/logic` | `@<scope>/fe-<m>` | `.` — реестр кода | `@<scope>/ui`, `@<scope>/fe-app`, `dmg-ui` |
| `frontend/<m>/<канал>` | `@<scope>/fe-<m>-<канал>` | `.` — реестр представлений; `./public` — кирпичи | `@<scope>/fe-<m>`, `@<scope>/ui`, `@<scope>/fe-app`, `@<scope>/<канал>-kit`, `./public` чужих модулей, база канала, `dmg-ui/<канал>` |
| `frontend/<канал>-kit` | `@<scope>/<канал>-kit` | `.` | `@<scope>/ui`, `@<scope>/fe-app`, `<база>-kit`, `dmg-ui` |
| `runners/<r>` | пакет раннера | — | всё, что собирает оболочка; модули — только через `.` |

Каждый импорт объявлен в `package.json` единицы (ARC-14), между единицами — только имя пакета и вход из `exports` (ARC-15). Имя модуля с дефисом может совпасть с парой «модуль × канал» (`fe-x-web`) — выбирай имена модулей без такого совпадения. Вынос пары в свой репозиторий — [extract-frontend-module.md](../guides/extract-frontend-module.md).

## 3. Пакет канала

Пакеты каналов в репо — `chat-ui`, `tg-bot`, `web-ui`; входы — `dmg-ui/<канал>` и `dmg-ui/<канал>/testing`. Учебный проект в пакетах каналов не лежит: его вход — `dmg-ui/example` (D-UI-121).

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
packages/example/                    учебный проект (вход dmg-ui/example), дерево — §2
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

Генератора видов UI пока нет. Форма для шаблонов — таблица §1 (суффикс, базовый класс, имя, папка, парные файлы, точка регистрации) и дерево §2. Образец каждого вида — запись в учебном проекте; что добавить и где зарегистрировать при новом экране, сторис, уведомлении или модуле — памятка [story-screen-notification.md §10](../guides/story-screen-notification.md#10-добавить-вид-в-учебный-проект).

## 7. Проверка

Правило `NM-01` ([rules.md](./rules.md), [D-UI-112](../decisions.md), [D-UI-119](../decisions.md)) проверяет класс `UiFileNames` из `dmg-ui/testing`. Класс диск не читает: принимает файлы `{ path, text }[]` (путь от корня проекта через `/`) и возвращает нарушения `{ file, line, text }[]`. Чтение и обход каталогов — у потребителя, вызов — в его тесте (`bun test`), а не в `arch:check`.

Конфигурация `UiNamesLayout` — зоны от корня проекта. `logic` и `channels` — шаблоны с одним `{m}` (имя UI-модуля, один сегмент пути), остальные поля — каталоги; `{m}` вне `logic` и `channels` или без него там — исключение конструктора. Файл вне всех зон не проверяется, зона без файлов — нарушение (у шаблона — ни одного файла ни у одного модуля):

| Поле | Что лежит | Что проверяется |
|---|---|---|
| `ui` | корень описания (`platform/ui`) | суффикс, имя; место: в корне — `.set` и помощники без вида; в корне модуля `<m>/` — только `<m>.ui-module.ts` и его тесты; ниже — один уровень папок сторис и `shared/`, у папки модуля есть `<m>.ui-module.ts`; `.story` — в папке своего имени, имя `shared` занято; экран одной сторис — в её папке, двух и больше — в `shared/`; виды кода, канала и оболочки — нарушение; тест рядом (§5) |
| `logic` | код модуля, шаблон (`frontend/{m}/logic`) | суффикс, имя; место: у `{m}` есть `<m>.ui-module.ts` в описании; один уровень папок; `.scode` и `.ncode` — не в корне, а парой `.screen` и `.notification` по тому же пути в описании (`logic/<папка>/<имя>.scode.ts` ↔ `ui/<m>/<папка>/<имя>.screen.ts`); прочие виды UI — нарушение; файлы без вида (вход, реестр `<m>-codes.ts`, помощники) — свободно; тест рядом |
| `channels` | каналы модуля, шаблоны (`frontend/{m}/<канал>`) | то же, что у `logic`, для `.view` — пара экран или уведомление по тому же пути; реестр `.views` — в корне канала; прочие виды UI — нарушение; тест рядом |
| `kits` | общие кирпичи без хозяина (`frontend/<канал>-kit`) | суффикс, имя; любой вид UI — нарушение; тест рядом |
| `shells` | оболочки — раннеры | суффикс, имя; из видов UI — только `.ui-app`, `.graph`, `.arch`, `.routes`, `.placements`, `.wire`, файлы без вида и во вложенных каталогах — свободно; тест рядом |
| `others` | прочий код UI без раскладки (приёмка, подмены кода) | суффикс и имя, место — нет |
| `tests` | дополнительные каталоги с тестами вне зон (сквозные, исполнитель) | только тест рядом (§5) |

Что проверяется:

| Проверка | Нарушение | Откуда вид |
|---|---|---|
| `суффикс` | объявление одного вида в файле с суффиксом другого; суффикс из словаря без своего объявления | объявление в тексте без комментариев: `export const X = <База>.define(` для `UiSetDef`, `UiModuleDef`, `UiAppDef`, `StoryDef`, `ScreenDef`, `NotificationDef`; `export [abstract] class X extends ScreenCode` или `NotificationCode`; у `.view`, `.views`, `.routes`, `.placements`, `.wire`, `.graph`, `.arch` базы нет — вид только по суффиксу |
| `имя` | суффикс верный, имя не `<Имя><Вид>` (или `<имя><Вид>` у коллекций канала) от `<имя>` файла | таблица §1 |
| `место` | вид UI не в своей зоне (описание, код модуля, канал модуля, оболочка; в kit — ни одного); нарушение дерева описания или зеркала (таблица зон выше): текст называет ожидаемый путь | суффикс и путь против зон; место экрана — по относительным импортам `.story` |
| `тест` | тест не по формам §5; `<имя>.story.test.ts` без `<имя>.story.ts` | файлы того же каталога |
| `вид файла` | объявления двух видов или два объявления одного вида | как у `суффикс` |
| `зона` | в каталоге или шаблоне конфигурации нет ни одного файла | список файлов |

Одна проблема файла — одна строка: при неверном суффиксе имя и место не проверяются, у вида кода в корне `logic` не ищется пара. Строка нарушения — строка объявления, иначе 1. Словарь открытый: файл с суффиксом вне §1 и без объявления вида (`shop-bot.community.ts`) не флагируется. Вид тестов, `*.fixture.ts` и `*.test-kit.ts` не проверяется; `*.browser.test.ts` вне проверки теста рядом. Пересекающиеся зоны разбираются по порядку: `ui`, `kits`, `shells`, `logic`, `channels`, `others`.

Место экрана выводится из относительных импортов `.story` (`from './…'`, `from '../…'`) в переданных текстах, без диска, по сторис того же модуля. Псевдонимы путей (`from '@app/ui/…'`) и реэкспорты (импорт через `index.ts` модуля или папки) не разрешаются: у такого экрана, как и у экрана, который не открывает ни одна сторис, место не выводится и не проверяется. Место уведомления внутри модуля не проверяется — оно в папке сторис или в `shared/`.

Тест потребителя — проект формы `single`; шаблоны `{m}` лежат под `src`, поэтому читается весь `src`, файлы вне зон не проверяются:

```ts
import { describe, expect, it } from 'bun:test';
import { UiFileNames, type UiNamesLayout } from 'dmg-ui/testing';

const LAYOUT: UiNamesLayout = {
  ui: 'src/platform/ui',
  logic: 'src/frontend/{m}/logic',
  channels: ['src/frontend/{m}/chat', 'src/frontend/{m}/web'],
  kits: ['src/frontend/web-kit'],
  shells: ['src/runners'],
};

/** Все `.ts` каталога: путь от корня проекта и текст. */
const read = async (dir: string) =>
  Promise.all(
    [...new Bun.Glob('**/*.ts').scanSync(dir)].map(async (file) => ({
      path: `${dir}/${file}`,
      text: await Bun.file(`${dir}/${file}`).text(),
    })),
  );

describe('имена файлов UI (NM-01)', () => {
  it('описание, код и каналы модулей, kit и оболочки — по naming.md', async () => {
    expect(new UiFileNames(LAYOUT).check(await read('src'))).toEqual([]);
  });
});
```

В репо `dmg-ui` учебный проект `packages/example/src` — зоны его раскладки: `ui` — `platform/ui`, `logic` — `frontend/{m}/logic`, `channels` — `frontend/{m}/chat`, `frontend/{m}/telegram`, `frontend/{m}/web`, `kits` — `frontend/telegram-kit` и `frontend/web-kit`, `shells` — `runners`; приёмка, `browser`, `checks`, `src` и `testing` пакетов — `others`; каталоги `packages`, `acceptance`, `checks`, `browser` — `tests`. Так пакет проверяет на себе то же, что требует от потребителя (`checks/repo-file-names.test.ts`).

Ограничения — в [rules.md](./rules.md#ограничения-правил): псевдоним базы, `export default class`, перенос перед `.define` и `export { X }` объявлением не считаются, объявление внутри строки — считается; место экрана за псевдонимом пути и реэкспортом не выводится; `.rule.ts` и `name` манифеста не проверяются.

## 8. Отличия от `dmg-core`

Дополнения, которых `dmg-core` не описывает:

- суффиксы видов UI (§1) и приставка `ui-` у занятых доменом слов;
- три дерева одного модуля — описание, код и канал — с парой манифеста, кода и представления по имени и пути (§1, §2), а не пара контракта и реализации по одинаковому пути (MAN-10);
- папка сторис и `shared/` в модуле, один уровень (§2);
- входы канала модуля `index.ts` (оболочке) и `public.ts` (чужим модулям), пакеты `fe-<m>`, `fe-<m>-<канал>`, `fe-app`, `<канал>-kit` (§2);
- реестры, коллекции и привязки канала — camelCase-значения `<m>Codes`, `<m><Канал>Views`, `<имя>Routes`, `<имя>Placements`, `<имя>Wire`, а не константы UPPER_SNAKE и не группы `<Агрегат>Events`;
- `.rule.ts`, `.const.ts`, `-schema.ts`;
- грань теста `<файл>.<грань>.test.ts`, тест темы `<тема>-<что>.test.ts`, `readme.test.ts`, `.browser.test.ts`;
- проверка имён и места — тестом потребителя (`UiFileNames`, `NM-01`, §7): суффикс ↔ вид объявления ↔ имя, зоны описания, кода, каналов, `kit` и оболочек, тест рядом; `arch:check` `dmg-core` этого не проверяет.
