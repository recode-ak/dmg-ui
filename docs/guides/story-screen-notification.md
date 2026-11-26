# Сторис, экран, уведомление — гайд

**Назначение:** как автор UI объявляет сторис, экран и уведомление манифестами и пишет код экрана. Пример — учебный набор [platform/ui/todo/finish-tasks/](../../packages/example/src/platform/ui/todo/finish-tasks/task-card.screen.ts) (импортируется из `dmg-ui/example`; код — `frontend/todo/logic/`, представления — `frontend/todo/<канал>/`, оболочки — `runners/`). Пакет канала — в [channel-package.md](./channel-package.md). Имена и раскладка файлов — [naming.md](../reference/naming.md). Исполнение, чеклист правил, ловушки и тесты — [story-screen-notification-run.md](./story-screen-notification-run.md); памятка для учебного проекта — [story-screen-notification-project.md](./story-screen-notification-project.md).

---

## 1. Когда применять

- Нужно описать, что человек видит и делает, независимо от канала: тот же экран работает в мессенджере, на странице и в консоли.
- Система сообщает человеку сама по доменному событию — это уведомление, а не экран.
- Канал, транспорт и рендер — другой гайд ([channel-package.md](./channel-package.md)). Логика «можно ли» остаётся в UC и агрегате: экран читает query UC и вызывает command UC.

## 2. Модель

| Понятие | Что объявляет | Класс |
|---|---|---|
| набор UI | модули поверх доменного приложения `dmg-core` | `UiSetDef` |
| приложение UI | канал, состав сторис и уведомлений, входы | `UiAppDef` |
| UI-модуль | экраны, сторис, уведомления одной области | `UiModuleDef` |
| сторис | кто (`callers`), зачем (`goal`), старт, экраны, исходы с целью, связи (`leads`), доступ (`access`), правила (`rules`) | `StoryDef` |
| экран | параметры, чтение, данные, состояние, действия, выходы | `ScreenDef` |
| уведомление | событие, получатели, чтение, ссылки | `NotificationDef` |

Принципы: экран читает, действие пишет; экран адресуем; вход действия объявляет схема; состояние — данные по схеме; код экрана не знает, где исполняется; открытых экранов может быть несколько; сторис — описание, а не диспетчер; манифест статичен, код ленив; логика показа (доступность, варианты) — в коде экрана, а не в представлении. Причины — в [decisions.md](../decisions.md) (D-UI-6, D-UI-7, D-UI-10).

Отдельная сторис или экран родительской — по признакам сторис, а не по вкусу: [Слои фронта](../concepts/frontend-layers.md#как-это-работает), п. 7.

## 3. Объявление

1. **Экран** — `ScreenDef.define({...})`: `params` (`v.strictObject`, UI-19), `reads` (query UC), `data`, необязательные `state`, `actions`, `locals`, `primary`, `exits`, `refresh`, `catches`, `examples`. Ссылка на другой экран в `to` — thunk с аннотацией возврата, иначе TS7022 (D-UI-8):
   ```ts
   back: {
     label: 'К списку',
     description: 'Возврат к списку задач.',
     to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
   },
   ```
   Действие `to` — структурный переход: уходящий экран кладётся в путь канала (D-UI-108); автокнопку «Назад» экран не объявляет, и подпись действия — не «Назад».
2. **Действие** — `uc` (command UC) и/или `to`. Без `uc` — переход (меню, листание). Действие вправе не вызывать UC; вызывает не больше одного (D-UI-10). `input` — схема полей (как их писать — ниже, «Поле входа»); `confirm` — подтверждение с текстами. Необязательное `hint` — подсказка человеку (у сторис, экрана, действия и локального действия одно имя), отдельная от `description`, который пишется для программиста; пересказ `label` или `description` подсказкой не считается. У исходов и выходов `hint` нет.
3. **Локальное действие** (`locals`) меняет только состояние экрана и UC не зовёт. Имена `actions` и `locals` не пересекаются (UI-21).
4. **Выходы** (`exits`) объявляет экран; `data` выхода — схема. Выход экрана получает значение через `TaskListScreenDef.exits.closed.with(...)`. Выход, который ведёт за пределы набора UI, принимает приёмник выходов — его даёт оболочка канала (у беседы — `ConversationsSpec.exits`, D-UI-90); приёмник не нужен — цель задаёт `after` исхода (п. 6).
5. **Перечитывание** — `refresh: [{ event, params, subject }]`: `params` сопоставляет параметр адреса с полем payload, `subject` — поле payload с `uuid` человека, `any: true` — «всем» (D-UI-22). Пустая запись — нарушение UI-17.
6. **Сторис** — `StoryDef.define`: `callers`, `goal` в форме «чтобы …», `start`, `screens`, `outcomes` с `exits: [Экран.exits.имя]` (UI-23). Экран о сторис не знает; один экран живёт в нескольких сторис. Необязательное: `leads` — thunk со сторис, в которые ведёт эта (переход — на `start` цели, связь без перехода — UI-24; отрезанная составом приложения ветка — `AppReach`, D-UI-95); `access` — правило Policy домена, тот же объект, что исполняет UC; `rules` — доменные правила для показа человеку (оба только объявлены, решает код экрана, D-UI-94); `hint` — подсказка человеку. У исхода — `after`: `'back'` (по умолчанию), `'home'` или адрес экрана; выход общего экрана ведёт к одной цели во всех сторис приложения (UI-25, D-UI-96).
   ```ts
   export const FinishTasksStoryDef = StoryDef.define({
     name: 'finishTasks',
     label: 'Выполнение задач',
     description: 'Пользователь отмечает задачи выполненными.',
     callers: ['user'],
     goal: 'чтобы закрыть сделанное',
     start: TaskListScreenDef,
     screens: [TaskListScreenDef, TaskCardScreenDef],
     outcomes: {
       closed: { label: 'Список закрыт', description: '…', exits: [TaskListScreenDef.exits.closed] },
       created: { label: 'Задача создана', description: '…', exits: [TaskListScreenDef.exits.created] },
     },
   });
   ```
7. **Уведомление** — `NotificationDef.define`: `event`, `recipients`, `reads`, `data`, `links`, `examples`. Получатели — `{ from: 'payload', fields: ['assigneeId'] }` или `{ from: 'query', uc, input, fields }`: query UC вызывает система (`SystemCaller` с `kind: 'app'`, `module` — имя набора UI, D-UI-23).
8. **Сборка** — `UiModuleDef.define({ screens, stories, notifications })`, затем `UiSetDef.define({ app: <AppDef домена>, modules })` и `UiAppDef.define({ set, channel, stories, notifications, entries })`. Вход — `entries.start.address: TaskListScreenDef.at({ page: 0 })`.
9. **Адрес.** `Screen.at(params)` даёт `Address`; через границу JSON адрес идёт как `AddressJson` (`AddressCodec.encode/decode`). `id` экрана — `<набор>/<модуль>/<экран>` (`UiIds.screen`). `decode` — внешние данные: отказ приходит значением (`AddressRejection`), не броском (D-UI-9). Параметры, влияющие на чтение (страница, фильтр, id), — параметры адреса, а не состояние; кэша диалога нет — экран читает заново по адресу. Значение вне диапазона (страница за концом) код экрана приводит к ближайшему допустимому, фактическое кладёт в `data`.

**Поле входа** (D-UI-100). Ядро читает схему поля и отдаёт каналу `ActionField`: подпись, вид, обязательность, подсказку, пример, пределы. Пиши поле так:

```ts
title: v.pipe(
  v.string(),
  v.minLength(1),
  v.title('Название задачи'), // подпись для человека; без него — description, затем имя поля
  fieldHint('Коротко: что нужно сделать'), // подсказка (v.metadata), не v.description
  v.examples(['Купить хлеб']), // пример: первый скаляр
  v.description('Название'), // для программиста (UI-14)
),
```

- Вид — по схеме: `v.number` — `number` (`v.integer` даёт предел «целое»), `v.boolean` — `boolean` (варианты «Да» и «Нет»), `picklist`, `enum`, union литералов — `choice` (список значений домена связывай с типом контракта: `as const satisfies readonly <Тип>[]`), `v.pipe(v.string(), v.isoDate())` — `date`; всё остальное, включая `v.date()`, откатывается на `string`. Дата — строка ISO.
- Пределы показываются из `v.minValue`, `v.maxValue`, `v.minLength`, `v.maxLength`, `v.length`, `v.nonEmpty`; сообщение схемы пиши по-человечески (`v.number('Введите номер страницы')`): канал показывает его как замечание.
- Число из строки приводит канал через `FieldInput`; не число отвергает схема.
- Подсказка и пределы — только показ: проверяет схема входа и Policy (D-UI-29). У поля с `F.sensitive` пример в `ActionField` не отдаётся, но `examples` и `hint` попадают в граф через JSON Schema входа и там видны: пример у `F.sensitive` пиши вымышленным. Правило графа UI-26 ловит `examples` у `F.sensitive` (D-UI-101). Поле `array` или `object` в `input` действия человек не введёт: правило UI-27.
- Дерево сторис для меню: `StoryTree.of(app)` отдаёт `roots()` (корни: сторис, в которые не ведёт связь другой сторис приложения) с вложенными `children` в порядке `leads`, сторис из нескольких мест — полный узел один раз, дальше `again: true`; в узле — `label`, `description`, `hint`, `goal`, `access` и `rules`. `access` и `rules` — объявленное, не вычисленное: по человеку меню отбирает доступность дверей (D-UI-98). `omitted()` — сторис, отрезанные составом приложения, с «откуда» (D-UI-101). Корни дерева видны в графе — `props.roots` узла приложения.

**Подсказка двери и справка** (D-UI-107). Дверь экрана — действие без `uc`, которое ведёт (кроме своего экрана) на `start` сторис приложения из `leads` сторис с этим экраном (`StoryDoors`). У двери без своей `hint` вид экземпляра (`ActionView.hint`) берёт `hint` сторис-цели, **если цель ровно одна**: две сторис с общим `start` (как «Планирование» и «Выполнение» на `taskList`) — подсказки нет, пиши `hint` у действия. Своя подсказка действия побеждает. Без приложения (`ScreenPreview`, исполнитель без `app`) подстановки нет; граф не меняется — подстановка в виде, не в Def. Справка — `new ScreenHelp(app)`: `of(view)` и `general()` дают `HelpSheet` (данные, текст строит канал): `title` — подпись экрана из Def (у общей — подпись приложения), `hint` — из вида, `items` — действия и локальные (отключённое — с причиной `disabled` из вида), `leads` — доступные двери; общая — корни `StoryTree` без `access`. Текст справки — только `hint`: `description` и `goal` пиши для программиста, `hint` — для человека.

```ts
new ScreenHelp(ExampleDialogUiAppDef).of(menuView);
// { title: 'Начать работу', hint: 'Отсюда начинается работа: выберите раздел',
//   items: [{ name: 'close', label: 'Закрыть' }],
//   leads: [{ name: 'tasks', label: 'Мои задачи' },
//           { name: 'assigned', label: 'Назначенные мне',
//             hint: 'Смотрите, что вам поручили, и выполняйте поручения' }] }
```

## 4. Код экрана и уведомления

`ScreenCode<D, S>` лежит отдельно от манифеста и вызывающего не видит (D-UI-7). Обязательны `load` и `done` у каждого действия — это проверяет `ScreenUnit` лениво, при первом `open` (не при сборке). Остальное необязательно:

- `load({ params, read, context })` — данные через `read(uc, input)`, только UC из `reads`; отказ UC — `err`.
- `actions[name]` — шаги: `command` строит вход UC (без него — вход действия), `done(ctx, output)` возвращает переход, `caught(ctx, error)` — переход по отказу с кодом из `catches`.
- `initialState(data)` — обязателен у экрана со `state`; `locals[name]` — чистая функция `(state, data, input) => state`.
- `availability[name]({ params, data, state, subject, context })` — ответ `Availability` о действии: `Availability.yes()`, `hidden()` (субъекту не положено, текста нет; в вид не попадает), `disabled(text)` (отключено с причиной); помощники `when(условие, текст)`, `policy(правило, субъект, ctx)` (нет субъекта или отказ — скрыто) и `rule(доменноеПравило, ctx)` (отказ — отключено с текстом ошибки). Нет записи — доступно. В виде — два ответа: доступно и отключено с причиной (`ViewAvailability`); булева признака нет (D-UI-98). В беседе и Telegram отключённое — вариант с пометкой `🚫` в подписи, нажатие отвечает причиной (D-UI-105).
- `choices(...)`, `defaults(...)` — варианты и начальные значения полей.

Субъект — доменный объект «кто смотрит» (тот, что получает Policy; не `Caller`) — лежит в `context.subject` у `load`, шагов и функции доступности; тип проекта — второй параметр `ScreenCode<D, S>`. Его кладёт канал в контекст рендера; без человека субъекта нет. Ответ о доступности — только показ: сервер перепроверяет каждый вызов (D-UI-29). Приложение вправе не включать часть связанных сторис: действие-переход в отрезанную сторис исполнитель из вида убирает (`ScreenRuntimeSpec.app`, D-UI-95).

**Данные приложения** (сведения организации, настройки) код экрана получает аргументом реестра кода модуля (`<m>Codes(…)`), сборку которого вызывает оболочка; окружение он не читает, сборку приложения не импортирует. Тип аргумента — узкий, структурно совместимый с объектом приложения.

**Мёртвых веток нет.** Защитная ветка на то, что уже гарантирует источник (схема `data`, ответ `Availability`, `catches`), не пишется: она не исполнится и прячет, что гарантию дал другой.

Переход — `Address` (свой экран с теми же параметрами значит «остаться и перечитать») или `exits.имя.with(data)`. Образец: [task-card.scode.ts](../../packages/example/src/frontend/todo/logic/finish-tasks/task-card.scode.ts).

`NotificationCode<D>`: `load({ payload, read })` собирает данные уведомления от имени получателя, `links(data, payload)` возвращает адреса из `links()` манифеста. Образец — [task-assigned.ncode.ts](../../packages/example/src/frontend/todo/logic/shared/task-assigned.ncode.ts).

Код модуля подключает реестр модуля `CodeLoaders.of(<M>UiModuleDef, [CodeLoader.screen(def, async () => new (await import('./x.scode')).XScreenCode()), CodeLoader.notification(def, async () => new (await import('./x.ncode')).XNotificationCode())])` в `frontend/<m>/logic/<m>-codes.ts`; загрузчик возвращает объект кода, а не модуль, и нужен каждому экрану и уведомлению модуля — иначе отказ конструктора UI-06 (образец — [profile-codes.ts](../../packages/example/src/frontend/profile/logic/profile-codes.ts)). Оболочка собирает реестры модулей приложения в `AppCodeLoaders.of(app, modules)` (образец — [example-codes.ts](../../packages/example/src/runners/example-codes.ts)).
