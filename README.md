# dmg-ui

Ядро UI на манифестах поверх `dmg-core` для TypeScript и Bun. Интерфейс описывается манифестами: сторис (кто и зачем), экран (что человек видит и делает), уведомление (что система сообщает сама). Из них ядро выводит адреса, исполнитель экранов, серверную часть, граф и проверки. Ядро о каналах не знает: мессенджер, веб-страница и консоль — отдельные пакеты каналов, а экраны и их код остаются общими.

Документация на русском. Образец всех артефактов — учебный проект [`packages/example/src`](packages/example/src/platform/ui/example-ui.set.ts) (вход `dmg-ui/example`): описание `platform/ui`, код и представления модулей `frontend/`, оболочки каналов `runners/` — диалог, Telegram и страница; для мессенджеров — гайды [Пакет мессенджера](docs/guides/messenger-package.md) и [Telegram](docs/guides/telegram.md), для страницы — [Web-канал](docs/guides/web-channel.md).

## Цель пакета

**Цель:** база для проектов, которые начинают одним фронтом в монорепо и дёшево уходят в микрофронтенды — фронт-модуль канала уходит в свой репозиторий и команду, раздел web пишется на своём фреймворке (сценарии роста `GR-UI-NN`, [Слои фронта](docs/concepts/frontend-layers.md#сценарии-роста)). Решение пакета пересматривается, если мешает цели: новая запись решения, а не обход ([D-UI-116](docs/decisions.md)). Вынос предусмотрен решениями и раскладкой, но вживую пока не проверен.

**Раскладка фронта проекта:** описание `platform/ui` (набор UI, модули, сторис, экраны, уведомления; нейтрально к каналу, из него строится граф), реализации модуля `frontend/<m>/logic` (код экранов) и `frontend/<m>/<канал>` (представления), общее `frontend/app` и `frontend/<канал>-kit`, оболочка канала — раннер `runners/<r>`. Почему так — [Слои фронта](docs/concepts/frontend-layers.md); куда положить файл и где зарегистрировать — [naming.md](docs/reference/naming.md) и памятка [«Добавить вид»](docs/guides/story-screen-notification-project.md#10-добавить-вид-в-учебный-проект).

## Кому что даёт

| Кто | Что получает |
|---|---|
| пользователь | одно поведение во всех каналах, свой язык и зону, понятный текст отказа, срез «за кулисами» по узлам с `visible` |
| разработчик | логика один раз, представление на канал; типизированные адреса; тесты без транспорта; примеры как snapshot; правила в `arch:check` |
| PO, аналитик | таблица «кто — что — зачем» из сторис; матрица «сторис × канал»; список «событие — кому — что сообщаем»; превью из примеров; действия с подписями как единица воронки и точка записи лога UI |
| devops | приложение UI — отдельный корень, размещаемый в юните (процесс, браузер); след от действия человека до лога операций; версии поставщиков в шапке графа |

## Слои и модель

| Слой | Что это | Знает |
|---|---|---|
| ядро `dmg-ui` | способ описать приложение UI и его правила: манифесты, исполнитель, граф, проверки | `dmg-core`; о каналах не знает |
| пакет канала | мессенджер, веб-страница, консоль; в репо — `chat-ui` (общая часть мессенджеров: беседа и её представления), `tg-bot` (канал Telegram: мессенджер поверх узкого порта Bot API) и `web-ui` (страничный канал: клиент в браузере, сервер сокета) | ядро; `tg-bot` — ещё и `chat-ui` |
| проект | описание, код экранов и представления по UI-модулям, оболочки каналов; библиотека транспорта | ядро, пакеты каналов, домен; слои проекта — [Слои фронта](docs/concepts/frontend-layers.md) |

Каналы устроены в три уровня — ядро, вид канала (беседа, страница), реализация: [Виды каналов](docs/guides/channel-package.md#виды-каналов).

Шесть видов Def: набор UI (`UiSetDef`), приложение UI (`UiAppDef`), UI-модуль (`UiModuleDef`), сторис (`StoryDef`), экран (`ScreenDef`), уведомление (`NotificationDef`). Манифест статичен, код экрана лежит отдельно и грузится лениво. Экран читает query UC, действие вызывает command UC и возвращает переход; адрес экрана от канала не зависит. Подробно — [гайд по сторис, экрану и уведомлению](docs/guides/story-screen-notification.md); причины решений — [decisions.md](docs/decisions.md). Как называть и раскладывать файлы — [Структура и именование UI](docs/reference/naming.md).

## Установка

Нужны Bun ≥ 1.4.4 и ssh-доступ к репозиториям `recode-ak/dmg-core` и `recode-ak/dmg-ui`. В реестре npm пакетов нет, ставятся они из git по тегу и одной командой:

```sh
bun add valibot @valibot/to-json-schema \
  git+ssh://git@github.com/recode-ak/dmg-core.git#v0.9.0 \
  git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.7.1
```

Почему одной. `dmg-core` у `dmg-ui` — peer-зависимость, а Bun ищет peer в реестре npm и получает 404. Если `dmg-core` назван в той же команде, Bun берёт его из git и peer удовлетворён. `@valibot/to-json-schema` — peer самого `dmg-core`.

Версия пакета — тег. Обновление — правка тега в `package.json` проекта и `bun install`. Диапазоны peer-зависимостей: `dmg-core ^0.9.0`, `valibot ^1.5.0`. Репо ставится целиком: поле `files` при установке из git не действует ([D-UI-2](docs/decisions.md)).

## Входы

| Импорт | Что даёт | Гайд |
|---|---|---|
| `dmg-ui` | манифесты, адрес, код экрана и уведомления, исполнитель `ScreenRuntime`, место личности; работает и в браузере | [Сторис, экран, уведомление](docs/guides/story-screen-notification.md) |
| `dmg-ui/graph` | поставщик графа `UiGraphProvider`, виды узлов и рёбер, префикс правил | [Каталог правил](docs/reference/rules.md) |
| `dmg-ui/server` | `UiServer`, `UiSession`, уведомитель `UiNotifier`, привязки к `ApiApp` и `ModuleApi`, контекст рендера | [Пакет канала](docs/guides/channel-package.md) |
| `dmg-ui/testing` | помощник рендера примеров `ExamplePreview`, наблюдатель `MemoryUiObserver`, проверка имён файлов UI `UiFileNames` | [Структура и именование UI](docs/reference/naming-check.md#7-проверка) |
| `dmg-ui/testing/fixtures` | девять помощников тестов ядра для пакетов каналов | [Пакет канала](docs/guides/channel-package.md) |
| `dmg-ui/example` | учебный проект: описание, код и представления модулей, сборки реестров, приложения UI и сборки `arch:check` оболочек (`ExampleDialogArch`, `ExampleWebArch`) | [Слои фронта](docs/concepts/frontend-layers.md) |
| `dmg-ui/dmg-core` | виды генератора `dmg-core gen` — `ui-module`, `story`, `screen`, `notification`: поставщик подключается в `providers` `.dmg/config.json`, места слоёв — в `layers` ([D-UI-123](docs/decisions.md)); тот же вход доставляет роли `dmg-ui-author`, `dmg-ux` и скил `dmg-ui` (`dmg-core sync`) | [Виды генератора](docs/guides/gen-kinds.md) |
| `dmg-ui/chat-ui` | общая часть мессенджеров: беседы, представления, сообщество, граф и правила `CH-NN`, порт мессенджера | [Пакет мессенджера](docs/guides/messenger-package.md) |
| `dmg-ui/chat-ui/testing` | подставной мессенджер `MemoryMessenger`, примеры набора `ChatExamples` и проверка лимитов `ExampleLimits` (CH-01) | [Пакет мессенджера](docs/guides/messenger-package.md#9-как-тестировать) |
| `dmg-ui/tg-bot` | мессенджер Telegram поверх порта Bot API, приём апдейтов, меню, правила `TG-NN` | [Telegram](docs/guides/telegram.md) |
| `dmg-ui/tg-bot/testing` | подставной порт Bot API `MemoryBotApi`, построитель апдейтов `TestUpdates` | [Telegram](docs/guides/telegram-checks.md#10-тестирование-и-пример) |
| `dmg-ui/web-ui` | страничный канал: клиент `PageClient`, сервер `PageHost`, провод в памяти `PageWire`, мост сокета `PageSockets`, ворота `PageGate`, конец сокета `PageSocketEnd` и адаптер `PageBrowserSocket`, переподключатель `PageReconnector`, поставщик графа и правила `PG-NN`, контракт представления (`ViewSource`, `PageViewState`, `PageRegionPresenter`), текстовая страница `PageText`, часы `PageSystemClock`, ворота и переподключение, история `PageBrowserHistory`, форма `PageFormModel`, реестр представлений `PageViews`, кодек адреса в URL `PageUrls`, пределы `MAX_CLIENT_TEXT` и `MAX_SERVER_TEXT` | [Web-канал](docs/guides/web-channel.md) |
| `dmg-ui/web-ui/testing` | подставные часы `ManualPageClock` и история `MemoryPageHistory` | [Web-канал](docs/guides/web-channel-checks.md#15-как-тестировать) |

Полный список имён — в файлах входов; причины деления на входы — [D-UI-4](docs/decisions.md), [D-UI-34](docs/decisions.md) и [D-UI-63](docs/decisions.md).

## Образец

- [`packages/example/src/`](packages/example/src/platform/ui/example-ui.set.ts) — учебный проект формы `single` поверх учебного приложения `dmg-core` ([D-UI-121](docs/decisions.md)): разделы `todo` и `profile`, вспомогательный модуль `users`, папки сторис и `shared/`, кирпич через `public.ts`, `web-kit`, `telegram-kit`; оболочки `runners/dialog`, `runners/tg-bot`, `runners/web`; `arch:check` проекта — в `check` репо.
- [`packages/chat-ui/src/conversation/`](packages/chat-ui/src/conversation/conversation.ts) — беседа мессенджера (вход `dmg-ui/chat-ui`): один живой экран, сигналы по одному, таблица ссылок, сбор входа, показ на месте или новым, путь и «Назад», снимок; представления — [`packages/chat-ui/src/view/`](packages/chat-ui/src/view/screen-presenter.ts); сторис на двух подставных мессенджерах — [`conversation-story.test.ts`](packages/chat-ui/testing/conversation-story.test.ts); [`packages/chat-ui/src/graph/`](packages/chat-ui/src/graph/chat-graph-provider.ts) — поставщик графа общей части мессенджеров; [`packages/chat-ui/src/dialog/`](packages/chat-ui/src/dialog/dialog-renderer.ts) — рендерер примеров учебного диалога; [`packages/chat-ui/src/community/`](packages/chat-ui/src/community/communities.ts) — манифесты сообщества и их исполнитель.
- [`packages/tg-bot/`](packages/tg-bot/testing/telegram-story.test.ts) — канал Telegram: сторис на подставном порте Bot API; подробно — гайды [Пакет мессенджера](docs/guides/messenger-package.md) и [Telegram](docs/guides/telegram.md).
- [`packages/web-ui/src/`](packages/web-ui/src/server/page-host.ts) — страничный канал: несколько областей, между клиентом и сервером только JSON; подключение — гайд [Web-канал](docs/guides/web-channel.md).

Оба канала проводят одну и ту же сторис при общем коде экранов; так проверяется нейтральность ядра ([D-UI-31](docs/decisions.md)). Сквозная проверка лежит на уровне монорепо, в [`acceptance/`](acceptance/channels-story.test.ts): один файл, семь сценариев на двух каналах и общем мире (`acceptance/support/`), плюс проверки нейтральности и состава; `tg-bot` проверяется своими тестами ([D-UI-102](docs/decisions.md)).

## Документы

Вход — [`llms.txt`](llms.txt): оглавление документации, роль агента и реестры. Агентам: скил `dmg-ui` — маршрут по задаче, роли [`dmg-ui-author`](agents/roles/dmg-ui-author.md) — пишет UI среза, и [`dmg-ux`](agents/roles/dmg-ux.md) — предлагает путь человека в постановке; процесс слоя UI — [docs/process.md](docs/process.md).

## Разработка пакета

Репо — монорепо с одним устанавливаемым пакетом `dmg-ui`: код в `packages/core` (`src/` — ядро, `testing/` — входы `dmg-ui/testing` и `dmg-ui/testing/fixtures`), `packages/chat-ui`, `packages/tg-bot` и `packages/web-ui` (пакеты каналов), `packages/example` (учебный проект, вход `dmg-ui/example`), `packages/gen` (виды генератора, вход `dmg-ui/dmg-core`; без своего `package.json`), `agents/roles/` (роли `dmg-ui-author` и `dmg-ux`, их доставляет `dmg-core sync`), приёмочные тесты поверх нескольких пакетов — в `acceptance/`, проверки разработчика пакета — в `checks/`. Направление импортов: ядро ← `chat-ui` ← `tg-bot`, ядро ← `web-ui`, только по имени входа ([D-UI-34](docs/decisions.md)); учебный проект видит все четыре, а к нему обращается только тестовый код пакетов ([D-UI-121](docs/decisions.md)).

```sh
bun install
bun run check
```

`check` запускает biome, `tsc --noEmit`, `bun test` и `dmg-core docs --check` (файлы `*.browser.test.ts` обычный `bun test` пропускает). Браузерные тесты — отдельно, `bun run browser`: запуск, Chrome и когда они нужны — [Web-канал, раздел 15](docs/guides/web-channel-checks.md#15-как-тестировать). Отдельно `bun run smoke <спецификатор>` ставит пакет во временный проект у потребителя (например, `git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.7.1`), сверяет их с `exports` установленного пакета, импортирует тринадцать входов и прогоняет `tsc`; нужны сеть и ssh, поэтому в `check` он не входит.

Запускаемый пример на живом Telegram — [`packages/example/src/runners/tg-bot`](packages/example/src/runners/tg-bot/README.md) ([D-UI-68](docs/decisions.md)): `bun run example:tg` (опрос `getUpdates`, нужен токен тестового бота в `.env`), `bun run example:tg:probe <chat_id>` (проба Bot API); чек-лист ручной проверки — в README примера. `grammy` — зависимость разработки только для него.

Запускаемый пример в браузере — [`packages/example/src/runners/web`](packages/example/src/runners/web/README.md) (вход `dmg-ui/web-ui`, гайд [Web-канал](docs/guides/web-channel.md), [D-UI-85](docs/decisions.md)): `bun run example:web` (сервер на `Bun.serve`, страница на DOM без фреймворка, два человека, «медленный сервер»); чек-лист ручной проверки — в README примера. Без зависимостей сверх пакета.

## Статус

Версия `0.7.1` не замораживает контракт между ядром и каналами: пока его определяют мессенджеры и страничный канал. Что в страничном канале не проверено без фреймворка — [D-UI-89](docs/decisions.md). Что сломано для потребителя: в `0.7.1` (с `0.7.0`) — ничего: документы, роль `dmg-ui-author`, опора разработки `dmg-core` `v0.9.1`; в `0.7.0` (с `0.6.x`) — опора `dmg-core ^0.9.0` и файлы `dmg-core` проекта в `.dmg/` — [D-UI-124](docs/decisions.md); в `0.6.0` (с `0.5.x`) — раскладка фронта, реестры на модуль, граф без представлений, учебный проект — [D-UI-122](docs/decisions.md); в `0.5.1` (с `0.5.0`) — ничего, патч примера `examples/web` ([D-UI-115](docs/decisions.md)); в `0.5.0` (с `0.4.0`) — [D-UI-114](docs/decisions.md), в `0.4.0` (с `0.3.2`) — [D-UI-109](docs/decisions.md). Контракт правится релизом с записью в [decisions.md](docs/decisions.md) ([D-UI-5](docs/decisions.md)). Открытое — в [debt.md](debt.md).

## Лицензия

MIT — [LICENSE](LICENSE).
