import * as v from 'valibot';

// Вложенное (JSON Schema, параметры входа) схема не раскрывает: глубину держат
// нормализация и тесты видов, как у `DOMAIN_KINDS`.
const nested = v.record(v.string(), v.unknown());

const item = { label: v.string(), description: v.string() };

const outcome = v.strictObject({
  name: v.string(),
  ...item,
  exits: v.array(v.strictObject({ screen: v.string(), exit: v.string() })),
});

const local = v.strictObject({
  name: v.string(),
  ...item,
  input: v.optional(nested),
});

const exit = v.strictObject({
  name: v.string(),
  ...item,
  data: v.optional(nested),
});

const entry = v.strictObject({
  name: v.string(),
  ...item,
  screen: v.string(),
  params: v.unknown(),
});

/**
 * Схемы `props` видов поставщика `dmg-ui`: данные, как `DOMAIN_KINDS`.
 * Порядок ключей — как в `UiNodes` и `UiEdges`. У видов без свойств схемы нет.
 */
export const UI_PROPS = {
  uiSet: v.strictObject({ app: v.string() }),
  uiModule: v.strictObject({}),
  story: v.strictObject({
    callers: v.array(v.string()),
    goal: v.string(),
    start: v.string(),
    outcomes: v.array(outcome),
  }),
  screen: v.strictObject({
    params: nested,
    state: v.optional(nested),
    primary: v.optional(v.string()),
    locals: v.array(local),
    exits: v.array(exit),
    examples: v.array(v.string()),
  }),
  action: v.strictObject({
    input: v.optional(nested),
    confirm: v.optional(v.strictObject(item)),
  }),
  notification: v.strictObject({
    recipients: v.strictObject({
      from: v.string(),
      fields: v.array(v.string()),
    }),
    examples: v.array(v.string()),
  }),
  uiApp: v.strictObject({
    set: v.string(),
    channel: v.string(),
    entries: v.array(entry),
  }),
  refreshedBy: v.strictObject({
    records: v.array(
      v.strictObject({
        params: v.record(v.string(), v.string()),
        subject: v.optional(v.string()),
        any: v.boolean(),
      }),
    ),
  }),
};
