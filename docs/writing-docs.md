# Как вести документы `dmg-ui`

**Назначение:** что из документов `dmg-ui` проверяет `check` репо и куда писать при изменении пакета. Типы документов, направления ссылок, вход и оглавления, кто и когда актуализирует — общие для пакетов `dmg-*`: `node_modules/dmg-core/docs/writing-docs.md`; виды, бюджеты, подписи и реестры — `node_modules/dmg-core/docs/reference/docs-format.md`. Здесь только своё `dmg-ui`.

---

## Состав `check`

`bun run check` — biome, `tsc`, `bun test`, `docs:check`. Документы проверяют:

| Проверка | Что ловит |
|---|---|
| `docs:check` (`dmg-core docs --check`) | дерево от [llms.txt](../llms.txt): вид и бюджет, подписи, битые ссылки и якоря, форма реестров, ссылки на ID |
| `checks/docs-tree.test.ts` | каждая серия реестра находится `docs show`; каждый `.md` репо входит в дерево (сирот нет) |
| `checks/guide-tasks.test.ts` | строки «Проверено:» и блоки `// из:` листов [Задач фронта](./guides/frontend-tasks.md) живы |
| `checks/track-references.test.ts` | в README, `docs/`, `agents/`, `skills/`, `llms.txt`, `debt.md` нет локальных номеров процесса и ссылок на внешние репо |
| `checks/rule-catalog.test.ts` | правила `UI`, `PG`, `CH`, `TG`, `NM` в коде и в [каталоге правил](./reference/rules.md) совпадают |

Новая серия реестра — строкой в список `REGISTRIES` теста дерева; новый лист «Задач фронта» — в его список листов; новый префикс правил — в `RULE_PREFIXES` ([граф канала](./guides/channel-package-view.md#5-представление-показ-и-граф), п. 3).

## Что куда писать при изменении

| Изменилось | Куда |
|---|---|
| правило | [rules.md](./reference/rules.md) — новый или изменённый ID серии `UI`, `CH`, `TG`, `PG`, `NM` |
| имя, суффикс или место файла | [naming.md](./reference/naming.md), [naming-package.md](./reference/naming-package.md), проверка — [naming-check.md](./reference/naming-check.md) |
| способ сделать артефакт | `guides/` — лист вида |
| слои фронта, сценарий роста | [Слои фронта](./concepts/frontend-layers.md); сценарий — `GR-UI-<n>` |
| контракт или компромисс | [decisions.md](./decisions.md) — новый `D-UI-<n>` или уточнение |
| осознанное отступление | [debt.md](../debt.md) — `DEBT-UI-<n>` |
| идея, сомнение до решения | [discussion.md](../discussion.md) — `DISC-UI-<n>` |
| знание для агента | лист темы; роль и скил только ссылаются на него |
| новый лист | строкой с подписью «когда открыть» в оглавление своего раздела |
| процесс слоя UI | [process.md](./process.md) |
