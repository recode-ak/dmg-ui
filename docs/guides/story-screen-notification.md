# Сторис, экран, уведомление — гайд

**Назначение:** как автор UI объявляет сторис, экран и уведомление манифестами, пишет код экрана и как всё это исполняется. Пример — учебный набор [testing/example/todo/](../../packages/core/testing/example/todo/task-card.screen.ts) (импортируется из `dmg-ui/testing`; привязка к диалоговому каналу — `dmg-ui/chat-ui/testing`). Пакет канала — в [channel-package.md](./channel-package.md).

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
| сторис | кто (`callers`), зачем (`goal`), старт, экраны, исходы | `StoryDef` |
| экран | параметры, чтение, данные, состояние, действия, выходы | `ScreenDef` |
| уведомление | событие, получатели, чтение, ссылки | `NotificationDef` |

Принципы: экран читает, действие пишет; экран адресуем; вход действия объявляет схема; состояние — данные по схеме; код экрана не знает, где исполняется; открытых экранов может быть несколько; сторис — описание, а не диспетчер; манифест статичен, код ленив; логика показа (доступность, варианты) — в коде экрана, а не в представлении. Причины — в [decisions.md](../decisions.md) (D-UI-6, D-UI-7, D-UI-10).

## 3. Объявление

1. **Экран** — `ScreenDef.define({...})`: `params` (`v.strictObject`, UI-19), `reads` (query UC), `data`, необязательные `state`, `actions`, `locals`, `primary`, `exits`, `refresh`, `catches`, `examples`. Ссылка на другой экран в `to` — thunk с аннотацией возврата, иначе TS7022 (D-UI-8):
   ```ts
   back: {
     label: 'К списку',
     description: 'Возврат к списку задач.',
     to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
   },
   ```
2. **Действие** — `uc` (command UC) и/или `to`. Без `uc` — переход (меню, листание). Действие вправе не вызывать UC; вызывает не больше одного (D-UI-10). `input` — схема полей, у каждого поле `v.description()`; `confirm` — подтверждение с текстами.
3. **Локальное действие** (`locals`) меняет только состояние экрана и UC не зовёт. Имена `actions` и `locals` не пересекаются (UI-21).
4. **Выходы** (`exits`) объявляет экран; `data` выхода — схема. Выход экрана получает значение через `TaskListScreenDef.exits.closed.with(...)`.
5. **Перечитывание** — `refresh: [{ event, params, subject }]`: `params` сопоставляет параметр адреса с полем payload, `subject` — поле payload с `uuid` человека, `any: true` — «всем» (D-UI-22). Пустая запись — нарушение UI-17.
6. **Сторис** — `StoryDef.define`: `callers`, `goal` в форме «чтобы …», `start`, `screens`, `outcomes` с `exits: [Экран.exits.имя]` (UI-23). Экран о сторис не знает; один экран живёт в нескольких сторис.
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
9. **Адрес.** `Screen.at(params)` даёт `Address`; через границу JSON адрес идёт как `AddressJson` (`AddressCodec.encode/decode`). `id` экрана — `<набор>/<модуль>/<экран>` (`UiIds.screen`). `decode` — внешние данные: отказ приходит значением (`AddressRejection`), не броском (D-UI-9). Параметры, влияющие на чтение (страница, фильтр), — параметры адреса, а не состояние.

## 4. Код экрана и уведомления

`ScreenCode<D>` лежит отдельно от манифеста и вызывающего не видит (D-UI-7). Обязательны `load` и `done` у каждого действия — это проверяет `ScreenUnit` лениво, при первом `open` (не при сборке). Остальное необязательно:

- `load({ params, read, context })` — данные через `read(uc, input)`, только UC из `reads`; отказ UC — `err`.
- `actions[name]` — шаги: `command` строит вход UC (без него — вход действия), `done(ctx, output)` возвращает переход, `caught(ctx, error)` — переход по отказу с кодом из `catches`.
- `initialState(data)` — обязателен у экрана со `state`; `locals[name]` — чистая функция `(state, data, input) => state`.
- `available(name, data, state)`, `choices(...)`, `defaults(...)` — доступность, варианты и начальные значения полей.

Переход — `Address` (свой экран с теми же параметрами значит «остаться и перечитать») или `exits.имя.with(data)`. Образец: [task-card.code.ts](../../packages/core/testing/example/todo/task-card.code.ts).

`NotificationCode<D>`: `load({ payload, read })` собирает данные уведомления от имени получателя, `links(data, payload)` возвращает адреса из `links()` манифеста. Образец — [task-assigned.code.ts](../../packages/core/testing/example/todo/task-assigned.code.ts).

Код подключает корень сборки реестром `CodeLoaders.of(set, [CodeLoader.screen(def, async () => new (await import('./x.code')).XScreenCode()), CodeLoader.notification(...)])`; загрузчик возвращает объект кода, а не модуль, и нужен каждому экрану и уведомлению набора (образец — [example-codes.ts](../../packages/core/testing/example/example-codes.ts)).

## 5. Исполнение

`ScreenRuntime.open(address, { context, trace })` даёт `ScreenInstance`; `restore(json, options)` — из снимка `InstanceJson`. Вид — `instance.view()` (`InstanceView`; в типах экрана — `ScreenViewOf<D>`). Подписка на изменения вида — `onChange(listener)`, причина — `ViewChange.cause`: `refreshed`, `acted`, `local`.

`act({ action, input, revision, confirmed, trace })` проверяет по порядку: закрыт → ревизия → имя → «только чтение» (действие с `uc` отключено исполнителем, D-UI-11) → доступность → подтверждение → вход по схеме → `command` → вызов UC → `done`/`caught` → проверка перехода по манифесту. Исходы `ActionOutcome`:

| исход | значение |
|---|---|
| `moved` | открыть адрес `address` |
| `stayed` | остаться: экземпляр перечитан, ревизия выросла |
| `exited` | экран закрыт выходом `exit` (с `data`) |
| `confirm` | нужно подтверждение (тексты из манифеста) |
| `rejected` | вход не по схеме; `issues` с полем и текстом |
| `refused` | отказ UC (`Refusal`: код, главная строка `ErrorText`, `caught`) или дефект кода — `SERVER_INTERNAL` |
| `stale` | ревизия вида устарела |
| `unavailable` | `unknown`, `disabled`, `readOnly`, `closed` |

Действия, перечитывание и локальные действия одного экземпляра идут по очереди; ревизия растёт только при загрузке; сигналы, пока перечитывание ждёт, сливаются в одно (D-UI-19). Состояние не по схеме при `restore` заменяется начальным, адрес не восстановился — отказ каналу (D-UI-21). Отказ UC — исход, а не бросок; перехватываются только коды из `catches` (D-UI-20).

Уведомление исполняет сервер на каждого получателя: данные читаются от его имени, ссылки берутся только из `links()` (D-UI-23). Событие перечитывает экран, но только читает; command UC по событию не исполняется (D-UI-22).

Каталог для документации и снимков: `new ScreenPreview({ set, codes })` даёт `screen(def, 'имя примера', context)` и `notification(def, 'имя')`; они строят вид и данные по `examples`, не зовя `load` и порты.

## 6. Два пути данных

Экран получает данные двумя путями, оба равноправны (D-72 пакета `dmg-core`, `node_modules/dmg-core/docs/decisions.md`). Агрегат и вопросы на клиенте — логика одна, но клиенту нужен код домена той же версии. Готовый ответ UC — один вызов и ровно нужные данные, но UC пишется под экран. Список, поиск, сводка и клиент без кода домена — готовый ответ; вопрос «можно ли» — агрегат. Выбор виден в графе по рёбрам `reads`.

## 7. Чеклист правил

Граф проверяет `bun run arch:check` с поставщиком `UiGraphProvider` (`dmg-ui/graph`). Каталог — [rules.md](../reference/rules.md).

- Сторис: UI-01 (вызывающие допущены к UC экранов), UI-02, UI-03, UI-04, UI-23.
- Экран: UI-08 (`reads` — только query), UI-09 (`uc` — только command), UI-12 (только UC для человека), UI-15, UI-16, UI-17, UI-19, UI-21.
- Тексты и примеры: UI-13 (заполнены), UI-14 (`description` у полей), UI-20 (примеры по схемам).
- Уведомление: UI-18 (поля получателей).
- Канал и приложение: UI-05, UI-06 (представление), UI-07, UI-10; общее — UI-11, UI-22.

## 8. Ловушки

- **`toMatchObject` с асимметричным матчером** мутирует проверяемый объект (Bun) — сравнивай поля по одному или через `toEqual`.
- **Код без `done`** обнаружится только при первом `open` экрана: проверь каждый экран тестом открытия.
- **`stayed` при отказе перечитывания.** Команда уже выполнена, а вид покажет `status: 'refused'`: не считай `stayed` «всё прошло».
- **«Назначенные мне» не перечитывается по `completed`:** в payload нет исполнителя, `subject` не из чего взять.
- **Данные уведомления не копируют payload** — читай через `read` от имени получателя.
- **Ловушки канала** — постоянный `requestId`, различимость «нет» и «не твоё», тексты замечаний `InputRejection.issues[].text`, повторный `UiNotifier.start()` — описаны в [channel-package.md](./channel-package.md) (разделы 3, 7, 8).

## 9. Как тестировать

- Состав и связи — `arch:check` и граф (`ExampleDialogArch` из `dmg-ui/chat-ui/testing`, `ExamplePagesArch` из `dmg-ui/testing` — образец сборки `ArchApp`); отдельные тесты манифестов не нужны (TST-09).
- Код экрана — тестом через `ScreenRuntime` с `MemoryUiObserver` из `dmg-ui/testing`: открыть, выполнить действие, проверить исход и записи (`kinds()`).
- Примеры — снимками: `ExamplePreview` из `dmg-ui/testing` рендерит пример через представление канала.
- Тесты изолированы и короткие (TST-04), проверяют код экрана, а не платформу или схемы (TST-09).
- Образец сквозного сценария — [conversation-story.test.ts](../../packages/chat-ui/testing/conversation-story.test.ts): приложение `ExampleApp` из `dmg-core/testing/example`, сервер, беседа мессенджера на двух подставных мессенджерах, два пользователя.
