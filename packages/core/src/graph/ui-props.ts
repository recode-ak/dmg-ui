import * as v from 'valibot';

// Вложенное (JSON Schema, параметры входа) схема не раскрывает: глубину держат
// нормализация и тесты видов, как у `DOMAIN_KINDS`.
const nested = v.record(v.string(), v.unknown());

const item = { label: v.string(), description: v.string() };

const outcome = v.strictObject({
  name: v.string(),
  ...item,
  exits: v.array(v.strictObject({ screen: v.string(), exit: v.string() })),
  after: v.union([
    v.literal('back'),
    v.literal('home'),
    v.strictObject({ screen: v.string(), params: v.unknown() }),
  ]),
});

const local = v.strictObject({
  name: v.string(),
  ...item,
  hint: v.optional(v.string()),
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

const via = { from: v.string(), screen: v.string() };

// Вход сторис: набор ключей задаёт вид (`via`), лишний ключ — отказ.
const startsFrom = v.variant('via', [
  v.strictObject({ via: v.literal('entry'), ...via, name: v.string() }),
  v.strictObject({ via: v.literal('notification'), ...via, event: v.string() }),
  v.strictObject({ via: v.literal('action'), ...via }),
  v.strictObject({ via: v.literal('redirect'), ...via }),
]);

/**
 * Схемы `props` видов поставщика `dmg-ui`: данные, как `DOMAIN_KINDS`.
 * Порядок ключей — как в `UiNodes` и `UiEdges`. У видов без свойств схемы нет.
 */
export const UI_PROPS = {
  uiSet: v.strictObject({ app: v.string() }),
  uiModule: v.strictObject({ section: v.boolean() }),
  story: v.strictObject({
    hint: v.optional(v.string()),
    callers: v.array(v.string()),
    goal: v.string(),
    start: v.string(),
    outcomes: v.array(outcome),
    startsFrom: v.array(startsFrom),
    access: v.optional(nested),
  }),
  screen: v.strictObject({
    hint: v.optional(v.string()),
    params: nested,
    state: v.optional(nested),
    primary: v.optional(v.string()),
    locals: v.array(local),
    exits: v.array(exit),
    examples: v.array(v.string()),
  }),
  action: v.strictObject({
    hint: v.optional(v.string()),
    input: v.optional(nested),
    confirm: v.optional(v.strictObject(item)),
    row: v.optional(
      v.strictObject({ list: v.string(), key: v.string(), label: v.string() }),
    ),
  }),
  notification: v.strictObject({
    recipients: v.variant('from', [
      v.strictObject({
        from: v.literal('payload'),
        fields: v.array(v.string()),
      }),
      // UC получателей — конец ребра `recipients`, а не свойство.
      v.strictObject({
        from: v.literal('query'),
        input: v.record(v.string(), v.string()),
        fields: v.array(v.string()),
      }),
    ]),
    examples: v.array(v.string()),
  }),
  uiApp: v.strictObject({
    set: v.string(),
    channel: v.string(),
    roots: v.array(v.string()),
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
