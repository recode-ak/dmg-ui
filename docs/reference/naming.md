# Структура и именование UI

**Назначение:** как раскладывать и называть файлы UI: набор UI, UI-модуль, сторис, экран, уведомление, код, приложение UI, представления канала, пакет канала. Общие правила кода и имён — те же, что в `dmg-core` (`node_modules/dmg-core/docs/reference/naming.md` §4, правило CODE-01): kebab-case файлов, суффикс вида, тест рядом, `<файл>.types.ts`, PascalCase, `undefined`, `private`. Здесь — только то, что добавляет UI. Образец — учебный набор [packages/core/testing/example](../../packages/core/testing/example/) и привязки каналов `packages/{chat-ui,tg-bot,web-ui}/testing/example`. Часть файлов пакетов каналов ещё названа иначе (`.app.ts`, `.telegram-view.ts`, `*-fixture.ts`, `.schema.ts`, тесты тем без головы вроде `page-socket.test.ts`); при расхождении правило — этот документ. Проверка имён — правило `NM-01`, класс `UiFileNames` (§7).

---

## 1. Виды и суффиксы

Файл — `<имя>.<вид>.ts`: `<имя>` — kebab-case (`task-list`), `name` манифеста — camelCase от него (`taskList`), класс — PascalCase имени и вида (`TaskListScreenDef`). Один суффикс — один вид. Приставка `ui-` — только там, где голое слово занято манифестом домена: `.module` (`ModuleDef`) и `.app` (`AppDef`) принадлежат `dmg-core`, поэтому UI-модуль — `.ui-module`, приложение UI — `.ui-app`. Свободные слова — без приставки: `.set`, `.story`, `.screen`, `.notification`.

Набор, UI-модуль, сторис, экран, уведомление и код — в пакете набора (§2); `<набор>` — имя набора без `Ui` (`example` у `exampleUi`), `<m>` — папка UI-модуля. Приложение UI, вход графа, представления и привязки — на стороне канала: в пакете канала это `packages/<канал>/testing/example/` (§3), у проекта — каталог своего канала.

| Вид | Суффикс | Экспорт, база | Имя | Пример (файл → имя) | Папка | Парные файлы | Точка регистрации |
|---|---|---|---|---|---|---|---|
| Набор UI | `.set.ts` | `UiSetDef` | `<Имя>SetDef`; имя набора оканчивается на `Ui` | `example-ui.set.ts` → `ExampleUiSetDef` (`name: 'exampleUi'`) | корень пакета набора | `<набор>-codes.ts`, `index.ts` | `UiAppDef.set`; первый аргумент `CodeLoaders.of`, `ChatViews.of`, `PageViews.of`; `UiGraphProvider({ set })` во входе графа |
| UI-модуль | `.ui-module.ts` | `UiModuleDef` | `<Имя>UiModuleDef` | `todo.ui-module.ts` → `TodoUiModuleDef` | `<набор>/<m>/`, имя папки = `name` модуля | — | `UiSetDef.modules` |
| Приложение UI | `.ui-app.ts` | `UiAppDef` | `<Имя>UiAppDef` | `example-dialog.ui-app.ts` → `ExampleDialogUiAppDef` | сторона канала | обычно `<имя>.views.ts`, `<имя>.graph.ts`, `<имя>.arch.ts` | `UiGraphProvider({ apps })` и `apps[].app` поставщика графа канала во входе графа `.graph.ts`; сборка канала (`app`) |
| Сторис | `.story.ts` | `StoryDef` | `<Имя>StoryDef` | `plan-tasks.story.ts` → `PlanTasksStoryDef` | `<набор>/<m>/` | — | `UiModuleDef.stories`; `UiAppDef.stories` |
| Экран | `.screen.ts` | `ScreenDef` | `<Имя>ScreenDef` | `task-list.screen.ts` → `TaskListScreenDef` | `<набор>/<m>/` | `<имя>.scode.ts` + `<имя>.scode.test.ts`; `<имя>.view.ts` в каждом канале или в общем `chat-ui` | `UiModuleDef.screens`; `StoryDef.screens`; вход — `UiAppDef.entries` (`address`) |
| Код экрана | `.scode.ts` | класс от `ScreenCode` | `<Имя>ScreenCode` | `task-list.scode.ts` → `TaskListScreenCode` | `<набор>/<m>/`, рядом с манифестом | `<имя>.screen.ts`, `<имя>.scode.test.ts` | `CodeLoader.screen(def, …)` в `CodeLoaders.of(set, [...])` файла `<набор>-codes.ts` |
| Уведомление | `.notification.ts` | `NotificationDef` | `<Имя>NotificationDef` | `task-assigned.notification.ts` → `TaskAssignedNotificationDef` | `<набор>/<m>/` | `<имя>.ncode.ts` + `<имя>.ncode.test.ts`; `<имя>.view.ts` в каждом канале или в общем `chat-ui` | `UiModuleDef.notifications`; `UiAppDef.notifications` |
| Код уведомления | `.ncode.ts` | класс от `NotificationCode` | `<Имя>NotificationCode` | `task-assigned.ncode.ts` → `TaskAssignedNotificationCode` | `<набор>/<m>/`, рядом с манифестом | `<имя>.notification.ts`, `<имя>.ncode.test.ts` | `CodeLoader.notification(def, …)` в `CodeLoaders.of(set, [...])` файла `<набор>-codes.ts` |
| Представление экрана или уведомления в канале | `.view.ts` | `ScreenPresenter.for` / `PagePresenter.for` / `NotificationPresenter.for` / `PageNotePresenter.for` (или `.of`); пример может иметь свою обёртку, как `ExampleScreenView.for` в `examples/web` | `<Имя>View` | `task-list.view.ts` → `TaskListView` | сторона канала | манифест `<имя>.screen.ts` или `<имя>.notification.ts` набора | `ChatViews.of` / `PageViews.of` в `.views.ts`; перекрытие под мессенджер — `ChatViews.over` |
| Представления приложения UI в канале | `.views.ts` | `ChatViews.of` / `PageViews.of` | `<имя>Views` | `example-dialog.views.ts` → `exampleDialogViews` | сторона канала | `<экран>.view.ts` канала; обычно `<имя>.ui-app.ts` | `apps[].views` поставщика графа канала во входе графа `.graph.ts`; сборка канала (`ConversationsSpec.views`) |
| Маршруты страничного канала | `.routes.ts` | массив `PageRouteDef` | `<имя>Routes` | `example-pages.routes.ts` → `examplePagesRoutes` | сторона канала | `<имя>.ui-app.ts` | `apps[].routes` `PageGraphProvider` во входе графа `.graph.ts`; `PageClientSpec.routes` |
| Размещения областей | `.placements.ts` | `readonly PagePlacement[]` | `<имя>Placements` | `example-window.placements.ts` → `exampleWindowPlacements` | сторона канала | — | `PageClientSpec.placements` |
| Привязка субъекта к проводу | `.wire.ts` | `{ toWire, revive }` | `<имя>Wire` | `example-subject.wire.ts` → `exampleSubjectWire` | сторона канала | — | `PageHostSpec.subjectToWire` (`toWire`), `PageClientSpec.reviveSubject` (`revive`) |
| Вход графа (как в `dmg-core`, D-96, D-97) | `.graph.ts` | `GraphApp` — `{ def, providers }`, экспорт по имени и по умолчанию | `<Имя>Graph` | `example-dialog.graph.ts` → `ExampleDialogGraph` | сторона канала | `<имя>.arch.ts`; обычно `<имя>.ui-app.ts`, `<имя>.views.ts` | `def` — `AppDef` домена; `providers` — `UiGraphProvider({ set, apps })` и поставщик графа канала (`apps[].app`, `apps[].views`, `apps[].routes`) |
| Сборка для `arch:check` | `.arch.ts` | `ArchApp` | `<Имя>Arch` | `example-dialog.arch.ts` → `ExampleDialogArch` | сторона канала | `<имя>.graph.ts` | разворачивает вход графа (`{ ...<Имя>Graph, layout }`); вход `arch:check` (`reportArchCheck`) |

`Def` и классы — PascalCase (`<Имя><Вид>Def`, `<Имя>View`, `<Имя>Graph`, `<Имя>Arch`); коллекции и привязки (`.views`, `.routes`, `.placements`, `.wire`) — значения, а не `Def`, поэтому camelCase от `<имя>` и слово вида. Один файл — один экспорт вида: у файла и у экспорта одно `<имя>` (`task-assigned.view.ts` → `TaskAssignedView`).

`.scode` и `.ncode` — сокращения `ScreenCode` и `NotificationCode`; класс берёт полное слово (`TaskListScreenCode`, не `TaskListScode`).

Код экрана и уведомления лежит рядом с манифестом, пара по имени: `task-list.screen.ts` + `task-list.scode.ts`. Представление в канале связано с манифестом тем же `<имя>`: `task-list.screen.ts` набора ↔ `task-list.view.ts` канала. Экран и уведомление различает `Def`-аргумент представления, а не суффикс: у обоих — `.view.ts`.

## 2. Набор UI

У проекта набор UI — отдельный пакет; образец — [packages/core/testing/example](../../packages/core/testing/example/). `<набор>` — имя набора без `Ui`: `example` → `example-ui.set.ts`, `name: 'exampleUi'`.

```
<набор>/
  index.ts                     вход пакета набора
  <набор>-codes.ts             реестр загрузчиков кода (`CodeLoaders.of(set, [CodeLoader.screen(...)])`)
  <набор>-ui.set.ts            UiSetDef — состав UI-модулей поверх AppDef домена
  <помощник>.ts                помощник набора без вида (example-subject.ts)
  <m>/                         папка UI-модуля, имя папки = `name` модуля
    <m>.ui-module.ts           UiModuleDef — экраны, сторис, уведомления модуля
    <имя>.screen.ts            ScreenDef
    <имя>.scode.ts             код экрана; рядом с <имя>.screen.ts, пара по имени
    <имя>.story.ts             StoryDef
    <имя>.notification.ts      NotificationDef
    <имя>.ncode.ts             код уведомления; рядом с <имя>.notification.ts
    <файл>.test.ts             тест рядом со своим файлом (`<имя>.scode.test.ts`)
    <файл>.types.ts, .const.ts типы и константы файла
    <помощник>.ts              класс-помощник без вида (example-tasks.ts, task-note.ts)
```

## 3. Пакет канала

```
packages/<канал>/
  src/                              вход dmg-ui/<канал>; каталоги по ответственности
    <тема>/<файл>.ts                один класс на файл; <файл>.types.ts, <файл>.const.ts, <файл>.test.ts рядом
    graph/rules/<имя>.rule.ts       реализация GraphRule, id правила в классе, тест <имя>.rule.test.ts
    index.ts
  testing/                          вход dmg-ui/<канал>/testing
    index.ts
    [<порт>/]memory-<порт>.ts       подставные порты (`Memory*`)
    <имя>.ui-app.ts                 приложение UI для тестов канала (routed-pages)
    <помощник>.ts                   помощник тестов канала (сцена графа, часы)
    example/                        привязка учебного набора к каналу
      <имя>.ui-app.ts               UiAppDef канала
      <имя>.views.ts                набор представлений канала
      <имя>.view.ts                 представление экрана или уведомления (пара по имени с манифестом набора)
      <имя>.graph.ts                вход графа: AppDef домена + поставщики UI и канала
      <имя>.arch.ts                 ArchApp: вход графа + раскладка
      <имя>.routes.ts, .placements.ts, .wire.ts    только страничный канал
      __snapshots__/                снимки превью
    <тема>-story.test.ts            сквозной сценарий канала на подставном порте
examples/<канал>/                    запускаемый пример (не поставляется)
acceptance/                          приёмка на двух каналах
browser/                             `*.browser.test.ts`, `bun run browser`, вне `bun test`
checks/                              проверки репо, не поставляются
```

Пакеты каналов в репо — `chat-ui`, `tg-bot`, `web-ui`; входы — `dmg-ui/<канал>` и `dmg-ui/<канал>/testing`.

Канал определяет папка: представление Telegram, перекрывающее общее представление `chat-ui`, — тоже `<имя>.view.ts`, но в `packages/tg-bot/testing/example/`.

## 4. Внутренности пакета

| Суффикс | Назначение |
|---|---|
| `.rule.ts` | реализация `GraphRule`; класс `<Имя>Rule`, ID правила в классе, тест `<имя>.rule.test.ts`; не путать с `.rules.ts` домена (`RulesDef`) |
| `.const.ts` | экспортируемые константы файла рядом с классом; пара `.types.ts` |
| `.types.ts`, `.const.ts` у файла вида | без суффикса вида: `example-limits.rule.ts` → `example-limits.types.ts`, `example-limits.const.ts` |
| `-schema.ts` | не суффикс: имя по содержимому — схемы valibot внешнего провода (`capabilities-schema.ts`, `bot-api-schema.ts`) |
| `.fixture.ts` | помощник тестов внутри пакета (как в `dmg-core`, TST-07) |
| `.browser.test.ts` | сценарий в Chrome; `bun run browser`, `bun test` его пропускает (`bunfig.toml`, D-UI-103) |
| `<файл>.<грань>.test.ts` | грань теста файла: канал, зона, режим |

Файл без вида называется kebab-именем своего класса или функции, дефис — часть имени, а не суффикс: `chat-views.ts` → `ChatViews`, `example-codes.ts` → `exampleCodes`, `channel-word-scanner.ts` → `ChannelWordScanner`. Реестр кода набора — `<набор>-codes.ts`.

## 5. Тесты и фикстуры

Тест лежит рядом со своим файлом. Допустимые формы:

- `<файл>.test.ts` — тест файла (`task-list.scode.test.ts`, `entry-point.rule.test.ts`);
- `<файл>.<грань>.test.ts` — грань теста файла, грань — kebab-слово без точки (`example-tokens.guard.test.ts`, `package-manifest.web-ui.test.ts`);
- `<тема>-<что>.test.ts` — тест темы: `<тема>` — собственный дефисный префикс имени теста, и в том же каталоге есть голова — `<тема>.ts` или `<тема>.<вид>.ts` (`conversation-help.test.ts` при `conversation.ts`, `cart-list-help.test.ts` при `cart-list.screen.ts`). Головой не служат `.types.ts`, `.const.ts`, `.fixture.ts`, `.test-kit.ts`, тесты и файлы-сводки `.ui-module.ts`, `.set.ts`: иначе `<m>.ui-module.ts` дал бы голову любому `<m>-….test.ts` в папке модуля. Префикс соседних файлов тему не задаёт — `page-socket.test.ts` при одних `page-host.ts` и `page-client.ts` не по форме;
- `readme.test.ts` — проверка README своего каталога или каталога выше (`examples/web/src/readme.test.ts` → `examples/web/README.md`);
- сквозной сценарий без одного файла — только прямо в каталоге `testing/`, `acceptance/`, `browser/` или `checks/` (не в его подкаталоге); сценарий канала — `<тема>-story.test.ts` (`telegram-story.test.ts`). `<имя>.story.test.ts` — только тест файла `<имя>.story.ts`.

Место фикстур и снимков:

- Снимки — `__snapshots__/` рядом с тестом.
- Фикстуры ядра: публичные — вход `dmg-ui/testing/fixtures` ([fixtures.ts](../../packages/core/testing/fixtures.ts), D-UI-34, D-UI-69); внутренние — `packages/core/testing/ui-*.fixture.ts`.
- Подставные порты — `Memory*` в `testing/` канала (`MemoryMessenger`, `MemoryBotApi`, `MemoryPageHistory`).
- Учебные данные — `example-tasks.ts` в папке модуля.

## 6. Генератор

Генератора видов UI пока нет. Форма для шаблонов — таблица §1: суффикс, базовый класс, имя, папка, парные файлы, точка регистрации, образец в учебном наборе. Образец каждого вида — одна минимальная запись в учебном наборе; точки регистрации — поля родителя или аргументы фабрики из колонки «Точка регистрации» (`UiModuleDef.screens`, `UiSetDef.modules`, `UiAppDef.stories`, `CodeLoaders.of`, `ChatViews.of` / `PageViews.of`, `providers` входа графа).

## 7. Проверка

Правило `NM-01` ([rules.md](./rules.md), [D-UI-112](../decisions.md)) проверяет класс `UiFileNames` из `dmg-ui/testing`. Класс диск не читает: принимает файлы `{ path, text }[]` (путь от корня проекта через `/`) и возвращает нарушения `{ file, line, text }[]`. Чтение и обход каталогов — у потребителя, вызов — в его тесте (`bun test`), а не в `arch:check`.

Конфигурация — каталоги от корня проекта, зона — префикс пути; файл вне всех зон не проверяется, зона без файлов — нарушение:

| Поле | Что лежит | Что проверяется |
|---|---|---|
| `sets` | корни наборов UI (§2) | суффикс, имя, место: виды набора — в `<корень>/<m>/` при `<m>/<m>.ui-module.ts`, `.set` — в корне; виды канала в наборе — нарушение; тест рядом (§5) |
| `channels` | каталоги стороны канала (§3) | суффикс, имя; виды набора в канале — нарушение; тест рядом (§5) |
| `others` | прочий код UI без раскладки по папкам (приёмка, подмены кода) | суффикс и имя, место — нет |
| `tests` | дополнительные каталоги с тестами вне `sets` и `channels` (сквозные, исполнитель) | только тест рядом (§5) |

Что проверяется:

| Проверка | Нарушение | Откуда вид |
|---|---|---|
| `суффикс` | объявление одного вида в файле с суффиксом другого; суффикс из словаря без своего объявления | объявление в тексте без комментариев: `export const X = <База>.define(` для `UiSetDef`, `UiModuleDef`, `UiAppDef`, `StoryDef`, `ScreenDef`, `NotificationDef`; `export [abstract] class X extends ScreenCode` или `NotificationCode`; у `.view`, `.views`, `.routes`, `.placements`, `.wire`, `.graph`, `.arch` базы нет — вид только по суффиксу |
| `имя` | суффикс верный, имя не `<Имя><Вид>` (или `<имя><Вид>` у коллекций канала) от `<имя>` файла | таблица §1 |
| `место` | вид набора вне `<набор>/<m>/` или глубже; `.set` не в корне набора; `.ui-module` не `<m>/<m>.ui-module.ts`; в папке `<m>` есть виды набора, а `<m>.ui-module.ts` нет; вид канала в наборе или наоборот | суффикс и путь против `sets` и `channels` |
| `тест` | тест не по формам §5; `<имя>.story.test.ts` без `<имя>.story.ts` | файлы того же каталога |
| `вид файла` | объявления двух видов или два объявления одного вида | как у `суффикс` |
| `зона` | в каталоге конфигурации нет ни одного файла | список файлов |

Одна проблема файла — одна строка: при неверном суффиксе имя и место не проверяются. Строка нарушения — строка объявления, иначе 1. Словарь открытый: файл с суффиксом вне §1 и без объявления вида (`shop-bot.community.ts`) не флагируется. Вид тестов, `*.fixture.ts` и `*.test-kit.ts` не проверяется; `*.browser.test.ts` вне проверки теста рядом.

Тест потребителя — набор и канал; тесты в них проверяются без поля `tests`:

```ts
import { describe, expect, it } from 'bun:test';
import { UiFileNames } from 'dmg-ui/testing';

/** Все `.ts` каталога: путь от корня проекта и текст. */
const read = async (dir: string) =>
  Promise.all(
    [...new Bun.Glob('**/*.ts').scanSync(dir)].map(async (file) => ({
      path: `${dir}/${file}`,
      text: await Bun.file(`${dir}/${file}`).text(),
    })),
  );

describe('имена файлов UI (NM-01)', () => {
  it('набор UI и канал названы по naming.md', async () => {
    const names = new UiFileNames({ sets: ['ui/shop/src'], channels: ['runners/web/src/ui'] });
    const files = [...(await read('ui/shop/src')), ...(await read('runners/web/src/ui'))];
    expect(names.check(files)).toEqual([]);
  });
});
```

Ограничения — в [rules.md](./rules.md#ограничения-правил): псевдоним базы, `export default class`, перенос перед `.define` и `export { X }` объявлением не считаются, объявление внутри строки — считается; `.rule.ts` и `name` манифеста не проверяются.

## 8. Отличия от `dmg-core`

Дополнения, которых `dmg-core` не описывает:

- суффиксы видов UI (§1) и приставка `ui-` у занятых доменом слов;
- пара манифеста и представления — по `<имя>` между пакетами набора и канала, а не по одинаковому пути контракта и реализации (MAN-10);
- коллекции и привязки канала — camelCase-значения `<имя>Views`, `<имя>Routes`, `<имя>Placements`, `<имя>Wire`, а не константы UPPER_SNAKE и не группы `<Агрегат>Events`;
- `.rule.ts`, `.const.ts`, `-schema.ts`;
- грань теста `<файл>.<грань>.test.ts`, тест темы `<тема>-<что>.test.ts`, `readme.test.ts`, `.browser.test.ts`;
- проверка имён — тестом потребителя (`UiFileNames`, `NM-01`, §7): суффикс ↔ вид объявления ↔ имя, папка UI-модуля и тест рядом; `arch:check` `dmg-core` этого не проверяет.
