import * as v from 'valibot';
import {
  MAX_REF_LENGTH,
  MAX_REFS,
  MAX_SEEN,
  MAX_SIGNAL_ID,
  REF_PATTERN,
} from './conversation.const';
import type { ConversationSnapshot } from './conversation.types';

// Схема снимка беседы (D-UI-45). Строгая в пределах: массивы и строки
// ограничены, ссылка — `[a-z0-9]` до 16 знаков, номера — целые не меньше 0.
// Снимок экземпляра ядра (`screen.instance`), параметры адреса, вход
// подтверждения и начальное значение поля схема не проверяет — их проверяет
// ядро. Аннотация
// `GenericSchema<unknown, …>` сверяет выход схемы с типом снимка.

/** Номер, ревизия, страница: целое не меньше 0. */
const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

const Ref = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(MAX_REF_LENGTH),
  v.regex(REF_PATTERN),
);

const ChoiceValue = v.union([v.string(), v.number(), v.boolean()]);

const Address = v.object({
  screen: v.string(),
  params: v.unknown(),
});

const RefEntrySchema = v.variant('kind', [
  v.object({
    ref: Ref,
    kind: v.literal('action'),
    screen: Count,
    revision: Count,
    action: v.string(),
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('local'),
    screen: Count,
    revision: Count,
    local: v.string(),
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('confirm'),
    screen: Count,
    revision: Count,
    action: v.string(),
    yes: v.boolean(),
    input: v.optional(v.unknown()),
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('choice'),
    draft: Count,
    field: v.string(),
    value: ChoiceValue,
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('skip'),
    draft: Count,
    field: v.string(),
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('page'),
    of: v.picklist(['screen', 'field']),
    owner: Count,
    page: Count,
    label: v.string(),
  }),
  v.object({
    ref: Ref,
    kind: v.literal('open'),
    address: Address,
    label: v.string(),
  }),
]);

const LiveScreen = v.object({
  serial: Count,
  instance: v.unknown(),
  shown: v.string(),
  handles: v.array(v.string()),
  page: Count,
});

const Field = v.object({
  name: v.string(),
  label: v.string(),
  optional: v.boolean(),
  choices: v.optional(
    v.array(v.object({ value: ChoiceValue, label: v.string() })),
  ),
  initial: v.optional(v.unknown()),
});

const Draft = v.object({
  serial: Count,
  screen: Count,
  target: v.variant('kind', [
    v.object({
      kind: v.literal('action'),
      action: v.string(),
      revision: Count,
    }),
    v.object({ kind: v.literal('local'), local: v.string(), revision: Count }),
  ]),
  fields: v.array(Field),
  values: v.record(v.string(), ChoiceValue),
  answered: v.array(v.string()),
  page: Count,
});

/** Схема снимка беседы: мусор — не по схеме, без броска (`safeParse`). */
export const ConversationSnapshotSchema: v.GenericSchema<
  unknown,
  ConversationSnapshot
> = v.object({
  version: v.literal(1),
  person: v.string(),
  serial: Count,
  refs: v.pipe(v.array(RefEntrySchema), v.maxLength(MAX_REFS)),
  seen: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(MAX_SIGNAL_ID))),
    v.maxLength(MAX_SEEN),
  ),
  screen: v.optional(LiveScreen),
  draft: v.optional(Draft),
});
