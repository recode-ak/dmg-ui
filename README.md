# dmg-ui

Ядро UI на манифестах поверх `dmg-core` для TypeScript и Bun. Интерфейс описывается манифестами: сторис (кто и зачем), экран (что человек видит и делает), уведомление (что система сообщает сама). Из них ядро выводит адреса, исполнитель экранов, серверную часть, граф и проверки. Ядро о каналах не знает: мессенджер, веб-страница и консоль — отдельные пакеты каналов, а экраны и их код остаются общими.

Документация на русском. Образец всех артефактов — учебный набор UI [`packages/core/testing/example`](packages/core/testing/example/example-ui.set.ts) и два канала: диалоговый (пакет `chat-ui`) и страничный (пакет `web-ui`); для мессенджеров — гайды [Пакет мессенджера](docs/guides/messenger-package.md) и [Telegram](docs/guides/telegram.md), для страницы — [Web-канал](docs/guides/web-channel.md).

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
| проект | манифесты и код сторис, экранов, представлений; библиотека транспорта | ядро, пакеты каналов, домен |

Каналы устроены в три уровня — ядро, вид канала (беседа, страница), реализация: [Виды каналов](docs/guides/channel-package.md#виды-каналов).

Шесть видов Def: набор UI (`UiSetDef`), приложение UI (`UiAppDef`), UI-модуль (`UiModuleDef`), сторис (`StoryDef`), экран (`ScreenDef`), уведомление (`NotificationDef`). Манифест статичен, код экрана лежит отдельно и грузится лениво. Экран читает query UC, действие вызывает command UC и возвращает переход; адрес экрана от канала не зависит. Подробно — [гайд по сторис, экрану и уведомлению](docs/guides/story-screen-notification.md); причины решений — [decisions.md](docs/decisions.md). Как называть и раскладывать файлы — [Структура и именование UI](docs/reference/naming.md).

## Установка

Нужны Bun ≥ 1.4.4 и ssh-доступ к репозиториям `recode-ak/dmg-core` и `recode-ak/dmg-ui`. В реестре npm пакетов нет, ставятся они из git по тегу и одной командой:

```sh
bun add valibot @valibot/to-json-schema \
  git+ssh://git@github.com/recode-ak/dmg-core.git#v0.6.3 \
  git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.5.1
```

Почему одной. `dmg-core` у `dmg-ui` — peer-зависимость, а Bun ищет peer в реестре npm и получает 404. Если `dmg-core` назван в той же команде, Bun берёт его из git и peer удовлетворён. `@valibot/to-json-schema` — peer самого `dmg-core`.

Версия пакета — тег. Обновление — правка тега в `package.json` проекта и `bun install`. Диапазоны peer-зависимостей: `dmg-core ^0.6.3`, `valibot ^1.5.0`. Репо ставится целиком: поле `files` при установке из git не действует ([D-UI-2](docs/decisions.md)).

## Входы

| Импорт | Что даёт | Гайд |
|---|---|---|
| `dmg-ui` | манифесты, адрес, код экрана и уведомления, исполнитель `ScreenRuntime`, место личности; работает и в браузере | [Сторис, экран, уведомление](docs/guides/story-screen-notification.md) |
| `dmg-ui/graph` | поставщик графа `UiGraphProvider`, виды узлов и рёбер, префикс правил | [Каталог правил](docs/reference/rules.md) |
| `dmg-ui/server` | `UiServer`, `UiSession`, уведомитель `UiNotifier`, привязки к `ApiApp` и `ModuleApi`, контекст рендера | [Пакет канала](docs/guides/channel-package.md) |
| `dmg-ui/testing` | учебный набор UI, константы примера, помощники примеров, проверка имён файлов UI `UiFileNames` | [Пакет канала](docs/guides/channel-package.md) |
| `dmg-ui/testing/fixtures` | десять помощников тестов ядра для пакетов каналов | [Пакет канала](docs/guides/channel-package.md) |
| `dmg-ui/chat-ui` | общая часть мессенджеров: беседы, представления, сообщество, граф и правила `CH-NN`, порт мессенджера | [Пакет мессенджера](docs/guides/messenger-package.md) |
| `dmg-ui/chat-ui/testing` | подставной мессенджер `MemoryMessenger`, привязка примера к диалогу | [Пакет мессенджера](docs/guides/messenger-package.md#9-как-тестировать) |
| `dmg-ui/tg-bot` | мессенджер Telegram поверх порта Bot API, приём апдейтов, меню, правила `TG-NN` | [Telegram](docs/guides/telegram.md) |
| `dmg-ui/tg-bot/testing` | подставной порт Bot API `MemoryBotApi`, построитель апдейтов, пример под Telegram | [Telegram](docs/guides/telegram.md#10-тестирование-и-пример) |
| `dmg-ui/web-ui` | страничный канал: клиент `PageClient`, сервер `PageHost`, провод в памяти `PageWire`, мост сокета `PageSockets`, ворота `PageGate`, конец сокета `PageSocketEnd` и адаптер `PageBrowserSocket`, переподключатель `PageReconnector`, поставщик графа и правила `PG-NN`, контракт представления (`ViewSource`, `PageViewState`, `PageRegionPresenter`), текстовая страница `PageText`, часы `PageSystemClock`, ворота и переподключение, история `PageBrowserHistory`, форма `PageFormModel`, реестр представлений `PageViews`, кодек адреса в URL `PageUrls`, пределы `MAX_CLIENT_TEXT` и `MAX_SERVER_TEXT` | [Web-канал](docs/guides/web-channel.md) |
| `dmg-ui/web-ui/testing` | привязка учебного примера к страничному каналу, подставные часы `ManualPageClock` и история `MemoryPageHistory` | [Web-канал](docs/guides/web-channel.md#15-как-тестировать) |

Полный список имён — в файлах входов; причины деления на входы — [D-UI-4](docs/decisions.md), [D-UI-34](docs/decisions.md) и [D-UI-63](docs/decisions.md).

## Образец

- [`packages/core/testing/example/`](packages/core/testing/example/example-ui.set.ts) — набор UI поверх учебного приложения `dmg-core`: экраны, сторис, уведомления, код, привязки к каналам.
- [`packages/chat-ui/src/conversation/`](packages/chat-ui/src/conversation/conversation.ts) — беседа мессенджера (вход `dmg-ui/chat-ui`): один живой экран, сигналы по одному, таблица ссылок, сбор входа, показ на месте или новым, путь и «Назад», снимок; представления — [`packages/chat-ui/src/view/`](packages/chat-ui/src/view/screen-presenter.ts); сторис на двух подставных мессенджерах — [`conversation-story.test.ts`](packages/chat-ui/testing/conversation-story.test.ts); [`packages/chat-ui/src/graph/`](packages/chat-ui/src/graph/chat-graph-provider.ts) — поставщик графа общей части мессенджеров; [`packages/chat-ui/src/dialog/`](packages/chat-ui/src/dialog/dialog-renderer.ts) — рендерер примеров учебного диалога; [`packages/chat-ui/src/community/`](packages/chat-ui/src/community/communities.ts) — манифесты сообщества и их исполнитель; привязка примера — `packages/chat-ui/testing/`.
- [`packages/tg-bot/`](packages/tg-bot/testing/telegram-story.test.ts) — канал Telegram: сторис на подставном порте Bot API; подробно — гайды [Пакет мессенджера](docs/guides/messenger-package.md) и [Telegram](docs/guides/telegram.md).
- [`packages/web-ui/src/`](packages/web-ui/src/server/page-host.ts) — страничный канал: несколько областей, между клиентом и сервером только JSON; подключение — гайд [Web-канал](docs/guides/web-channel.md).

Оба канала проводят одну и ту же сторис при общем коде экранов; так проверяется нейтральность ядра ([D-UI-31](docs/decisions.md)). Сквозная проверка лежит на уровне монорепо, в [`acceptance/`](acceptance/channels-story.test.ts): один файл, семь сценариев на двух каналах и общем мире (`acceptance/support/`), плюс проверки нейтральности и состава; `tg-bot` проверяется своими тестами ([D-UI-102](docs/decisions.md)).

## Документы

| Документ | Что в нём |
|---|---|
| [Сторис, экран, уведомление](docs/guides/story-screen-notification.md) | как объявить манифесты, написать код экрана, как всё исполняется, чеклист правил, ловушки, тесты |
| [Пакет канала](docs/guides/channel-package.md) | что должен дать канал, сборка, политики по исходам, граф, граница JSON, безопасность, доставка уведомлений |
| [Задачи фронта](docs/guides/frontend-tasks.md) | какие задачи фронта закрыты ядром и каналами, чем (манифест, класс, решение) и чем проверено: меню по роли, право и отключённое, карточка из другой сторис, «Назад», поля, справка, смена человека |
| [Web-канал](docs/guides/web-channel.md) | подключение `dmg-ui/web-ui`: состав, контракт представления, провод и привязка к `Bun.serve`, URL и маршруты, области, история, форма и жест, показ до ответа, граф и правила `PG-NN`, безопасность, решения без реализации, тесты, чеклист проекта |
| [Пакет мессенджера](docs/guides/messenger-package.md) | общая часть мессенджеров `chat-ui` и что обязан дать пакет конкретного мессенджера: беседа, лимиты, сообщество, граф, тесты, чеклист |
| [Telegram](docs/guides/telegram.md) | подключение `dmg-ui/tg-bot`: сборка, апдейты, тексты и кнопки, меню, сообщество, возможности, отказы, что не проверено на живом Telegram |
| [Структура и именование UI](docs/reference/naming.md) | суффиксы видов UI и имена классов, дерево набора UI и пакета канала, место тестов и фикстур |
| [Каталог правил](docs/reference/rules.md) | правила графа `UI-NN`, `CH-NN`, `TG-NN` и `PG-NN`, правило имён файлов `NM-01`, ограничения правил, проверки репозитория |
| [Решения](docs/decisions.md) | реестр `D-UI-N`: что решено и почему |
| [Технический долг](debt.md) | открытое в пакете, `DEBT-UI-N` |
| [К обсуждению](discussion.md) | пожелания и идеи, по которым ещё нет решения |
| [`llms.txt`](llms.txt) | вход для агентов |

Что куда писать. Как объявить экран, сторис, уведомление — гайд «Сторис, экран, уведомление». Какая задача фронта чем закрыта — «Задачи фронта». Как сделать канал — «Пакет канала», как подключить страничный канал — «Web-канал». Как сделать мессенджер — «Пакет мессенджера», как подключить Telegram — «Telegram». Новое правило графа — строка в каталоге правил. Почему выбрано так, а не иначе, — запись в решениях. Отступление, которое не исправлено, — запись в долге. Знание из `dmg-core` не повторяется: на него ссылаются путём `node_modules/dmg-core/docs/…`.

## Разработка пакета

Репо — монорепо с одним устанавливаемым пакетом `dmg-ui`: код в `packages/core` (`src/` — ядро, `testing/` — входы `dmg-ui/testing` и `dmg-ui/testing/fixtures`), `packages/chat-ui`, `packages/tg-bot` и `packages/web-ui` (пакеты каналов), приёмочные тесты поверх нескольких пакетов — в `acceptance/`, проверки разработчика пакета — в `checks/`. Направление импортов: ядро ← `chat-ui` ← `tg-bot`, ядро ← `web-ui`, только по имени входа ([D-UI-34](docs/decisions.md)).

```sh
bun install
bun run check
```

`check` запускает biome, `tsc --noEmit` и `bun test` (файлы `*.browser.test.ts` обычный `bun test` пропускает). Браузерные тесты — отдельно, `bun run browser`: запуск, Chrome и когда они нужны — [Web-канал, раздел 15](docs/guides/web-channel.md#15-как-тестировать). Отдельно `bun run smoke <спецификатор>` ставит пакет во временный проект у потребителя (например, `git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.5.1`), сверяет их с `exports` установленного пакета, импортирует одиннадцать входов и прогоняет `tsc`; нужны сеть и ssh, поэтому в `check` он не входит.

Запускаемый пример на живом Telegram — [`examples/tg-bot`](examples/tg-bot/README.md) ([D-UI-68](docs/decisions.md)): `bun run example:tg` (опрос `getUpdates`, нужен токен тестового бота в `.env`), `bun run example:tg:probe <chat_id>` (проба Bot API); чек-лист ручной проверки — в README примера. `grammy` — зависимость разработки только для него.

Запускаемый пример в браузере — [`examples/web`](examples/web/README.md) (вход `dmg-ui/web-ui`, гайд [Web-канал](docs/guides/web-channel.md), [D-UI-85](docs/decisions.md)): `bun run example:web` (сервер на `Bun.serve`, страница на DOM без фреймворка, два человека, «медленный сервер»); чек-лист ручной проверки — в README примера. Без зависимостей сверх пакета.

## Статус

Версия `0.5.1` не замораживает контракт между ядром и каналами: пока его определяют мессенджеры и страничный канал. Что в страничном канале не проверено без фреймворка — [D-UI-89](docs/decisions.md). Что сломано для потребителя: в `0.5.1` (с `0.5.0`) — ничего, патч примера `examples/web` ([D-UI-115](docs/decisions.md)); в `0.5.0` (с `0.4.0`) — [D-UI-114](docs/decisions.md), в `0.4.0` (с `0.3.2`) — [D-UI-109](docs/decisions.md). Контракт правится релизом с записью в [decisions.md](docs/decisions.md) ([D-UI-5](docs/decisions.md)). Открытое — в [debt.md](debt.md).

## Лицензия

MIT — [LICENSE](LICENSE).
