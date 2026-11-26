# Структура и именование UI

**Назначение:** как раскладывать и называть файлы фронта: описание (набор UI, UI-модуль, сторис, экран, уведомление), реализации модуля (код экранов и уведомлений, представления канала), общее фронта, оболочку канала и пакеты в `monorepo`. Общие правила кода и имён — те же, что в `dmg-core` (`node_modules/dmg-core/docs/reference/naming.md` §4, правило CODE-01): kebab-case файлов, суффикс вида, тест рядом, `<файл>.types.ts`, PascalCase, `undefined`, `private`. Здесь — только то, что добавляет UI. Почему фронт разложен так — [Слои фронта](../concepts/frontend-layers.md). Образец — учебный проект [packages/example](../../packages/example/src/): описание [platform/ui](../../packages/example/src/platform/ui/), реализации модулей [frontend](../../packages/example/src/frontend/), оболочки [runners](../../packages/example/src/runners/). Пакеты канала, место тестов, генератор — [naming-package.md](./naming-package.md); проверка имён и места (`NM-01`, `UiFileNames`) — [naming-check.md](./naming-check.md).

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
| Код уведомления | `.ncode.ts` | класс от `NotificationCode` | `<Имя>NotificationCode` | `task-assigned.ncode.ts` → `TaskAssignedNotificationCode` | `FE/<m>/logic/<папка>/` — тот же путь, что у манифеста | `<имя>.notification.ts` в описании, `<имя>.ncode.test.ts` рядом (необязателен: `NM-01` его не требует) | `CodeLoader.notification(def, …)` в `CodeLoaders.of` файла `<m>-codes.ts` |
| Представление экрана или уведомления | `.view.ts` | `ScreenPresenter.for` / `PagePresenter.for` / `NotificationPresenter.for` / `PageNotePresenter.for` (`ScreenPresenter.of` — полная форма); проект может иметь свою обёртку, как `ExampleScreenView.for` в `FE/web-kit` | `<Имя>View` | `profile-summary.view.ts` → `ProfileSummaryView` | `FE/<m>/<канал>/<папка>/` — тот же путь, что у манифеста | манифест в описании | `ChatViews.of` / `PageViews.of` в `<m>-<канал>.views.ts`; перекрытие канала на базе — `<m><База>Views.over([...])` |
| Реестр представлений модуля | `.views.ts` | `ChatViews.of` / `PageViews.of` / `.over`; реестр на своей технологии (DOM, фреймворк) — класс проекта на `UiCompleteness`, образец `ExampleViews` в `FE/web-kit` | `<m><Канал>Views` | `profile-chat.views.ts` → `profileChatViews` | корень `FE/<m>/<канал>/` | `.view.ts` канала модуля; `index.ts` | вход `index.ts` канала модуля → сборка оболочки (`AppChatViews`, `AppPageViews`) |
| Реестр кода модуля | файл без вида `<m>-codes.ts` | функция, возвращает `CodeLoaders.of(<M>UiModuleDef, …)` | `<m>Codes` | `profile-codes.ts` → `profileCodes` | корень `FE/<m>/logic/` | `<m>-codes.types.ts` (подмены `<M>CodeOverrides`), `index.ts` | вход `index.ts` кода модуля → сборка оболочки (`AppCodeLoaders`) |
| Входы модуля | `index.ts`, `public.ts` | реэкспорт | — | `FE/users/chat/public.ts` → `AccountStatus` | корень `FE/<m>/logic/` и `FE/<m>/<канал>/`; `public.ts` — только у канала | — | `index.ts` — реестр модуля для оболочки (UI-34); `public.ts` — кирпичи для чужих модулей того же канала (UI-32, D-UI-120) |
| Приложение UI | `.ui-app.ts` | `UiAppDef` | `<Имя>UiAppDef` | `example-dialog.ui-app.ts` → `ExampleDialogUiAppDef` | `R/<r>/` | `<имя>.graph.ts`, `<имя>.arch.ts`, сборка реестров | `UiGraphProvider({ apps })` и `apps[].app` поставщика графа канала во входе графа; сборка реестров (`AppCodeLoaders.of(app, …)`, `AppChatViews.of(app, …)`, `AppPageViews.of(app, …)`) |
| Маршруты страничного канала | `.routes.ts` | массив `PageRouteDef` | `<имя>Routes` | `example-pages.routes.ts` → `examplePagesRoutes` | `R/<r>/` | `<имя>.ui-app.ts` | `apps[].routes` `PageGraphProvider` во входе графа; `PageClientSpec.routes` |
| Размещения областей | `.placements.ts` | `readonly PagePlacement[]` | `<имя>Placements` | `example-window.placements.ts` → `exampleWindowPlacements` | `R/<r>/` | — | `PageClientSpec.placements` |
| Привязка субъекта к проводу | `.wire.ts` | `{ toWire, revive }` | `<имя>Wire` | `example-subject.wire.ts` → `exampleSubjectWire` | `R/<r>/` | — | `PageHostSpec.subjectToWire` (`toWire`), `PageClientSpec.reviveSubject` (`revive`) |
| Вход графа (как в `dmg-core`, D-96, D-97) | `.graph.ts` | `GraphApp` — `{ def, providers }`, экспорт по имени и по умолчанию | `<Имя>Graph` | `example-dialog.graph.ts` → `ExampleDialogGraph` | `R/<r>/` | `<имя>.arch.ts`, `<имя>.ui-app.ts` | `def` — `AppDef` домена; `providers` — `UiGraphProvider({ set, apps, channels })` и поставщик графа канала (`apps[].app`, возможности, точки входа, у страничного — `routes`). Импортирует описание и файлы оболочки без реестров: до кода экранов и представлений не доходит (ARC-16 `dmg-core`) |
| Сборка для `arch:check` | `.arch.ts` | `ArchApp` | `<Имя>Arch` | `example-dialog.arch.ts` → `ExampleDialogArch` | `R/<r>/` | `<имя>.graph.ts` | `{ ...<Имя>Graph, project, runners, layers, graphEntry }` — вход `arch:check`; каталоги слоёв фронта — `ArchApp.layers` (§2) |
| Сборка реестров оболочки | файл без вида: `<имя>-codes.ts`, `<имя>-views.ts` | функция, возвращает `AppCodeLoaders` / `AppChatViews` / `AppPageViews` или сборку проекта на `ModuleRegistries` (образец `AppExampleViews` в `R/web/view`) | `<имя>Codes`, `<имя>Views` | `example-dialog-views.ts` → `exampleDialogViews` | `R/` или `R/<r>/` | реестры модулей из их `index.ts` | исполнитель (`ScreenRuntime`), беседа, страничный клиент, `UiNotifier`, превью; модули области — `ModuleRegistries.required(app)` |

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
        public.ts                  кирпичи для чужих модулей того же канала (если есть)
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
| `frontend/app` | `@<scope>/fe-app` | `.` | `@<scope>/ui`, `kernel`, домен, `dmg-ui` |
| `frontend/<m>/logic` | `@<scope>/fe-<m>` | `.` — реестр кода | `@<scope>/ui`, `@<scope>/fe-app`, `kernel`, домен, `dmg-ui` |
| `frontend/<m>/<канал>` | `@<scope>/fe-<m>-<канал>` | `.` — реестр представлений; `./public` — кирпичи | `@<scope>/fe-<m>`, `@<scope>/ui`, `@<scope>/fe-app`, `@<scope>/<канал>-kit`, `./public` чужих модулей, база канала, `kernel`, домен, `dmg-ui` |
| `frontend/<канал>-kit` | `@<scope>/<канал>-kit` | `.` | `@<scope>/ui`, `@<scope>/fe-app`, `<база>-kit`, `kernel`, домен, `dmg-ui` |
| `runners/<r>` | пакет раннера | — (или `.`) | всё, что собирает оболочка; модули — только через `.` |

Каждый импорт объявлен в `package.json` единицы (ARC-14), между единицами — только имя пакета и вход из `exports` (ARC-15). `dmg-ui` — тоже только по входам из его `exports`: подпуть мимо них — `tsc` TS2307. Имя модуля с дефисом может совпасть с парой «модуль × канал» (`fe-x-web`) — выбирай имена модулей без такого совпадения. Вынос пары в свой репозиторий — [extract-frontend-module.md](../guides/extract-frontend-module.md).

**Линтер.** Карта линтера `dmg-core` (`docs/reference/rules.md` пакета `dmg-core`, «Карта линтера») в `monorepo` называет «все исходники» шаблонами `platform/*/src`, `backend/*/src`, `runners/*/src`: описание (`platform/ui/src`) она покрывает, а код и каналы модулей (`frontend/*/*/src`), `frontend/app` и `frontend/<канал>-kit` (`frontend/*/src`) — нет. Проект добавляет эти шаблоны к каждой строке карты для всех исходников (ARC-09, CODE-02, DOM-12, DOM-17, ERR-01, API-02, API-07, API-05): без них правила с кода экранов и представлений снимаются молча, ошибки нет. Пакеты npm по слоям фронта: описание и код модуля — `dmg-ui` (корень), `dmg-core`, `valibot`; канал модуля — ещё вход своего канала (`dmg-ui/chat-ui`, `dmg-ui/web-ui`); тесты — ещё `bun:test` и тестовые входы `dmg-ui` и `dmg-core`. Нарушение (`node:*`, `dmg-ui/server` в описании; входы каналов в коде модуля) `arch:check` не ловит (D-UI-117 — ревью); проект закрепляет список `noRestrictedImports` по каталогам слоёв в `biome.json`.

## 8. Отличия от `dmg-core`

Дополнения, которых `dmg-core` не описывает:

- суффиксы видов UI (§1) и приставка `ui-` у занятых доменом слов;
- три дерева одного модуля — описание, код и канал — с парой манифеста, кода и представления по имени и пути (§1, §2), а не пара контракта и реализации по одинаковому пути (MAN-10);
- папка сторис и `shared/` в модуле, один уровень (§2);
- входы канала модуля `index.ts` (оболочке) и `public.ts` (чужим модулям), пакеты `fe-<m>`, `fe-<m>-<канал>`, `fe-app`, `<канал>-kit` (§2);
- реестры, коллекции и привязки канала — camelCase-значения `<m>Codes`, `<m><Канал>Views`, `<имя>Routes`, `<имя>Placements`, `<имя>Wire`, а не константы UPPER_SNAKE и не группы `<Агрегат>Events`;
- `.rule.ts`, `.const.ts`, `-schema.ts`;
- грань теста `<файл>.<грань>.test.ts`, тест темы `<тема>-<что>.test.ts`, `readme.test.ts`, `.browser.test.ts`;
- проверка имён и места — тестом потребителя (`UiFileNames`, `NM-01`, [§7](./naming-check.md#7-проверка)): суффикс ↔ вид объявления ↔ имя, зоны описания, кода, каналов, `kit` и оболочек, тест рядом; `arch:check` `dmg-core` этого не проверяет.
