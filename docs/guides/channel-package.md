# Пакет канала — гайд

**Назначение:** что должен дать пакет канала (мессенджер, страница, консоль), как собрать его поверх ядра `dmg-ui`, какие политики выбрать по исходам, как встроиться в граф и где проходит граница безопасности. Образцы — учебные каналы в `dmg-ui/testing`: диалоговый [testing/dialog/](../../packages/core/testing/dialog/dialog.ts) и страничный [testing/page/](../../packages/core/testing/page/server/page-host.ts). Объявление экранов — [story-screen-notification.md](./story-screen-notification.md).

---

## 1. Когда применять

- Нужно показать сторис, экраны и уведомления набора UI в конкретном канале: бот, веб-страница, терминал, агент.
- Ядро не знает каналов: у него нет `interface Channel` (D-UI-17). Контракт канала — порты, которые зовёт ядро (`CallerSource`, `RecipientCallers`, `NotificationDelivery`, `UiObserver`), и объекты, которые ядро отдаёт (`ScreenRuntime`, `ScreenInstance`, `InstanceView`, исходы).
- Объявление экранов и кода — другой гайд ([story-screen-notification.md](./story-screen-notification.md)).

## 2. Что канал обязан дать

1. **Представления** экранов и уведомлений: вид (`InstanceView`, в типах экрана — `ScreenViewOf<D>`) в разметку канала. Ядро ничего не рисует.
2. **Сбор входа** действия по полям (`ActionView.fields`: подпись, признак, варианты, начальные значения) и показ подтверждения и отказов.
3. **Личность**: как человек канала становится `Caller` и `RenderContext` (язык, пояс, `delegate`, `readOnly` из `RenderFlags`).
4. **Хранение** открытых экранов и их состояния (`ScreenInstance.snapshot()` / `ScreenRuntime.restore`); куда вести, если адрес не восстановился.
5. **Точки входа** — команда, маршрут, ссылка — на входы, которые объявило приложение UI.
6. **След**: на каждый входящий сигнал канал рождает `Trace.fromRequest({ requestId, channel })`.
7. **Политику по исходам** действия (раздел 4) и **доставку уведомлений** (раздел 9).
8. **Граф**: ребро `presents` и, если нужно, свои виды узлов и правила (раздел 5).

## 3. Сборка

Все импорты — из публичных входов: `dmg-ui`, `dmg-ui/server`, `dmg-ui/graph`.

1. **Код.** `CodeLoaders` (реестр загрузчиков набора) создаёт корень сборки; образец — `exampleCodes()`. Загрузчики другого набора — бросок при сборке.
2. **Сервер.** Один на набор: `new UiServer({ set, dispatch, context, nodes? })`. `dispatch` — бэкенд вызова UC: `new ApiAppDispatch(api)` в одном процессе или `new ModuleApiDispatch([...apis])` для модулей вне процесса; `context` — `{ bus, logger }` приложения; `nodes` — узлы канала (`ChannelNode`: `id`, `uses`, `listens`).
3. **Сессия личности.** `server.session(source)` даёт `UiSession`: она же `UcPort` и `RefreshPort` для исполнителя. `CallerSource`: `subjectId` (субъект для сопоставления событий; у заместителя — замещаемый), `channel` (канал следа), `resolve(trace)` → `Caller`. Образец — `DialogIdentity.source()`.
4. **Исполнитель.** `new ScreenRuntime({ set, codes, ucs: session, refresh: session, observer })`. Дальше `open(address, { context, trace })`, `restore(json, options)`. Контекст рендера канал строит сам: `{ locale, timeZone, delegate, readOnly }`, признаки — `RenderFlags.of(caller.value)`.
5. **Уведомления.** `new UiNotifier({ app, codes, dispatch, callers, delivery, observer, context }).start()`; `callers` — `RecipientCallers` (`resolve(uuid, trace)` → `Caller`), `delivery` — `NotificationDelivery.deliver(notification)`. Запуск один: повторный `start()` без остановки бросает; `start()` возвращает отписку.
6. **Наблюдатель.** `UiObserver.record(entry)` синхронный и не бросает; в записи нет входа, данных и payload. Для тестов — `MemoryUiObserver`.

Две части канала (D-UI-16): исполнитель экранов (клиент, `dmg-ui`) и серверная (`dmg-ui/server`). Между ними только JSON (раздел 6). Исполнитель не тянет `dmg-core/app` и `/graph`, поэтому работает в браузере.

```ts
const server = new UiServer({ set: ExampleUiSetDef, dispatch: new ApiAppDispatch(example.api), context });
const session = server.session(identity.source());
const runtime = new ScreenRuntime({ set, codes, ucs: session, refresh: session, observer });
const instance = await runtime.open(address, { context: renderContext, trace: trace.toJSON() });
```

## 4. Политики по исходам

Исход `act` решает канал; ядро только сообщает. Неизвестный исход (новый в ядре) — дефект канала, бросок (ERR-06). Диалоговый канал ([dialog.ts](../../packages/core/testing/dialog/dialog.ts), метод `settle`):

| исход | диалог |
|---|---|
| `moved` | открыть `address` новым экземпляром, предыдущий закрыть |
| `stayed` | показать вид заново (ревизия выросла) |
| `exited` | показать текст выхода (подпись и описание из Def), открыть вход `start` |
| `confirm` | спросить «да/нет»; «да» повторяет `act` с `confirmed: true` |
| `rejected` | повторить поле из первого замечания с его текстом |
| `refused` | показать вид с текстом отказа; у `caught` — свой текст представления |
| `stale` | показать вид (он уже на новых данных) с заметкой |
| `unavailable` | заметка; `unknown` — дефект канала |

Локальное действие: `changed` — показать вид, `rejected` — как выше, `refused` — текст отказа (экземпляр прежний), `unavailable` — заметка.

Страничный канал отличается тем, что экранов несколько (области `main` и `side`): `moved` открывает адрес в области назначения; `exited` в `main` ведёт на вход `start` с заметкой, в `side` — очищает область; `confirm` и `rejected` хранятся в области до следующего действия. Остальное — как в диалоге ([page-client.ts](../../packages/core/testing/page/client/page-client.ts), метод `settle`). «Один живой экран» — политика диалога, а не ядра.

Подписи действий и выходов канал берёт из Def: `UiIds.findScreen(id)` даёт `AnyScreenDef` с `actions`, `locals` и `exits` (у каждого `label`); `normalize()` для этого не нужен.

## 5. Представление и граф

Канал — второй поставщик графа: `implements GraphProvider` (`node_modules/dmg-core/docs/guides/graph-extension.md` — шаги вида Def, видов и правил; здесь только отличия UI).

1. **Ребро `presents`.** Приложение UI `presents` каждый экран и уведомление, у которых в канале есть представление; ставит его пакет канала (`UI_EDGE_KINDS.presents`, `UiIds.app(app)` — откуда, `UiIds.screen/notification` — куда). Без него срабатывает UI-06. Образец — [dialog-graph-provider.ts](../../packages/core/testing/dialog/dialog-graph-provider.ts): своих видов и правил нет, `kinds()` пуст.
2. **Свой вид узла** — точка входа канала. `PageRouteDef` — вид Def `pageRoute` (путь и имя входа приложения), узел под приложением, ребро `opens` к экрану входа. Достижимость экранов ядро считает от входов (UI-07), поэтому вход должен быть объявлен в `entries` приложения.
3. **Свои правила — свой префикс** (ARC-13): префикс не из префиксов пакета `dmg-core` и не `UI`. У страничного канала — `PG` (PG-01 — маршрут ведёт на объявленный вход, PG-02 — у входа есть маршрут; [rules.md](../reference/rules.md)). Правило читает граф запросами (`outgoing`, `children`), не ветвится по виду Def.
4. **Вызов UC из узла канала** (сигнал канала, не действие): узел объявляет `uses` и `listens` как `ChannelNode`, а ребро `invokes` ставит канал. Правило UI-10 защищает такие узлы: они не вызывают command UC по событию.
5. **Вход графа.** `ArchApp` собирает `providers: [new UiGraphProvider({ set, apps }), new <Канал>GraphProvider(...)]` поверх доменного приложения; образцы — `ExampleDialogArch`, `ExamplePagesArch`. Имя поставщика `dmg-ui` уникально: один `UiGraphProvider` на набор. Поставщик страниц ограничен одним приложением UI.

## 6. Граница JSON и провод

Между исполнителем (клиент) и сервером — только JSON; клиент недоверен. Сервер сверяет каждый вызов сам (D-UI-28, D-UI-33).

- **Вызов UC** — простая команда `UcCall`: `{ module, uc, input, requestId }` или `{ …, eventId }`. Ни узла графа, ни следа, ни `Caller`. Сервер сверяет пару `(module, uc)` с объединением объявленного узлами сессии (`UcRoutes`), сам подставляет след и вызывающего. Command UC по `eventId` не исполняется.
- **Сообщения** страничного канала ([page-messages.types.ts](../../packages/core/testing/page/wire/page-messages.types.ts)): клиент → сервер `call`, `watch`, `unwatch`; сервер → клиент `hello`, `result`, `signal`, `watch-refused`, `notification`, `refused`. Схемы строгие: через провод не проходят `trace`, `caller`, `recipient` и payload события.
- **Порядок.** `watch` до `call` загрузки: подписка раньше чтения не пропускает событие между ними. Провод обязан быть упорядоченным в каждую сторону (WebSocket такой; независимые запросы HTTP — нет).
- **Личность — по токену соединения.** `PageHost.connect(token, push)`: токен → `uuid` → сессия; клиент `uuid` не шлёт. Контекст рендера приходит в `hello` один раз.
- **Пределы** (константы в `*.const.ts`): строка клиента 64 КиБ (до `JSON.parse`), 16 одновременных вызовов и 64 подписки на соединение, 8 соединений на личность, идентификаторы до 256 символов. Мусор и превышение — `refused`, не бросок (ERR-01); `warn` без данных клиента (ERR-07), на мусор и предел вызовов — раз на соединение.
- **Сигнал перечитывания** — без payload, след обезличен: `correlationId` — `eventId`. Настоящий след сессия помнит по `eventId` (не больше 256 выданных).
- **Выход.** `exited.data` провод не пересекает: исполнитель на клиенте; JSON-формы выхода на проводе нет.

Обходы мест, где контракт ядра пока не закрыт:

- **Повтор загрузки** — открыть адрес заново (`open`), своей команды «повторить» у экземпляра нет.
- **`moved.address`** — внешние данные: `AddressCodec.decode`, отказ — вход приложения, не бросок.
- **`UiSession.watch` с недекодируемым адресом бросает** — ловит канал, подписка отклоняется (`watch-refused`).
- **`on` узла канала** (`UiSession.on(node, def, handler)`) — вне ядра: сверяет только, что узел объявил событие; обработчик получает события всех людей, отсева по `subjectId` нет — фильтрует канал.

## 7. Безопасность для автора канала

Граница доступа — Policy UC и `callers` (D-UI-29), а не свойства вида.

- **`available`, `confirm`, `readOnly` — не граница.** Клиент вправе прислать любой `call`. `readOnly` отключает действия исполнитель на клиенте; сервер отказывает только по Policy UC.
- **`trace` доставки получателю не показывай:** в нём настоящий `correlationId` инициатора.
- **В текст ошибки доставки данные не клади:** сбой `deliver` попадает в `logger.error` вместе с `message` броска.
- **Строки клиента экранируй при показе:** `OPERATION_NOT_FOUND` отражает `module` и `uc` клиента (до 256 символов).
- **`correlationId` клиента — заявление,** а не доказательство; доверенный только тот, что собрал сервер.
- **Запись `refresh` без `subject`** — оракул: подписчик узнаёт, что событие с такими параметрами случилось у кого-то. Для личных данных задавай `subject`.
- **Различимость отказов.** «Нет» (`TASK_NOT_FOUND`) и «не твоё» (`ACCESS_DENIED`) не показывай по-разному там, где идентификатор угадывается.
- **`InputRejection.text`** повторяет введённое значение (сообщение схемы): показывай его только автору значения; свои тексты — лучше эха valibot (DEBT-3 `dmg-core`, [debt.md](../../debt.md)).
- **Личность.** `uuid` в сессию попадает только из аутентифицированного транспорта, не из данных запроса.

## 8. Идентификаторы запросов

`requestId` каждого входящего сигнала — новый (`crypto.randomUUID()`). Повторный `requestId` платформа считает повтором запроса: «Запрос уже принят». В тестах id задаётся счётчиком (`requestIds: () => 'r-' + (++n)`).

## 9. Доставка уведомлений

- `UiNotifier` отдаёт каналу `DeliveredNotification`: `notification` (`id` узла), `recipient`, `data`, `links` (`AddressJson`), `cause: { event, eventId }`, `trace`.
- **Отсев повтора и предел** — политика канала: ядро только передаёт `cause.eventId`. Ключ — `notification + recipient + eventId` (диалог, [dialog-delivery.ts](../../packages/core/testing/dialog/dialog-delivery.ts)); ключ ставь после успешной доставки, чтобы бросок не отсеял повтор.
- Без `CallerSource.channel` у гостя отсева повторов нет.
- Сбой `deliver` — бросок: сервер его логирует и идёт к следующему получателю; уведомление не копится. Очередь, push и письмо — дело канала (страничный канал при отсутствии соединений не доставляет и не копит).
- В сообщение клиенту кладут `data`, `links` и `eventId`; `trace` и `recipient` — нет ([page-delivery.ts](../../packages/core/testing/page/server/page-delivery.ts)).

## 10. Чеклист

- ARC-04, ARC-08 — канал импортирует только публичные входы `dmg-ui`, `dmg-core`; UC вызывает через `dispatch` сервера.
- ARC-13 — свой префикс правил; UI-06 — ребро `presents` на каждый экран и уведомление приложения.
- ERR-01, ERR-06, ERR-07 — внешний вход не бросает, неизвестный исход — дефект канала, `warn` без данных клиента.
- Нейтральность: в коде экрана и ядра нет слов канала; в пакете это проверяют тест импортов и сканер слов канала — образец такой проверки для своего канала.
- Личность — из транспорта; `CallerSource.channel` задан; `requestId` новый на сигнал; `RenderContext` строится из `RenderFlags`.
- Каждый исход `ActionOutcome` и `LocalOutcome` разобран в `switch` с веткой `never`.
- Отсев повтора уведомлений и предел памяти (`RefTable`, входящие, отсеянные ключи) решены явно.

## 11. Как тестировать

- Граф — `reportArchCheck([ArchApp])` с поставщиками; сцена с нарушением даёт код 1 и строку `ID: …` ([page-graph-provider.test.ts](../../packages/core/testing/page/graph/page-graph-provider.test.ts) — образец).
- Сквозной сценарий (TST-09, один): приложение `ExampleApp` из `dmg-core/testing/example`, `UiServer`, `UiNotifier` с доставкой канала, два пользователя — [dialog-story.test.ts](../../packages/core/testing/dialog-story.test.ts), [page-story.test.ts](../../packages/core/testing/page-story.test.ts).
- Провод — в памяти, строки JSON и журнал сообщений; тишину ждёт `PageWire.settled()` без таймеров (TST-04).
- Политики — тестом на каждый исход с `MemoryUiObserver`; примеры рендера — `ExamplePreview` и снимки.
- Безопасность — тесты на недоверенный вход: мусор, строка длиннее предела, чужая пара `(module, uc)`, повтор подписки.
