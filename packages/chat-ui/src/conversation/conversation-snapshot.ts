import { FIELD_KINDS } from 'dmg-ui';
import * as v from 'valibot';
import { ACCENTS, MOMENT_SHOWS, TEXT_STYLES } from '../message/message.const';
import {
  HASH_PATTERN,
  MAX_FIELD_CHOICES,
  MAX_FIELDS,
  MAX_FRAGMENT_TEXT,
  MAX_FRAGMENTS,
  MAX_HANDLES,
  MAX_LABEL_LENGTH,
  MAX_LINK_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTIFIED,
  MAX_NOTIFIED_KEY,
  MAX_PATH,
  MAX_PERSON_LENGTH,
  MAX_REF_LENGTH,
  MAX_REFS,
  MAX_SEEN,
  MAX_SHOWN_LENGTH,
  MAX_SIGNAL_ID,
  MAX_SIGNAL_TEXT,
  REF_PATTERN,
} from './conversation.const';
import type { ConversationSnapshot } from './conversation.types';

// Схема снимка беседы (D-UI-45). Строгая в пределах: массивы и строки
// ограничены (`MAX_*` в `conversation.const.ts`), ссылка — `[a-z0-9]` до 16
// знаков, номера — целые не меньше 0.
// Последнее сообщение живого места — по схеме текстового сообщения с
// пределами, хэш ключа следа — 64 знака hex.
// Снимок экземпляра ядра (`screen.instance`), элементы пути переходов (до
// `MAX_PATH`), параметры адреса, вход подтверждения и начальное значение поля
// схема не проверяет — их проверяет ядро. Аннотация
// `GenericSchema<unknown, …>` сверяет выход схемы с типом снимка.

/** Номер, ревизия, страница: целое не меньше 0. */
const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

/** Имя действия, локального действия, поля, адреса экрана. */
const Name = v.pipe(v.string(), v.maxLength(MAX_NAME_LENGTH));

/** Подпись варианта или поля. */
const Label = v.pipe(v.string(), v.maxLength(MAX_LABEL_LENGTH));

const Ref = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(MAX_REF_LENGTH),
  v.regex(REF_PATTERN),
);

// Строка значения — и свободный текст собеседника: предел — как у сигнала.
const ChoiceValue = v.union([
  v.pipe(v.string(), v.maxLength(MAX_SIGNAL_TEXT)),
  v.number(),
  v.boolean(),
]);

const Address = v.object({
  screen: Name,
  params: v.unknown(),
});

const RefEntrySchema = v.variant('kind', [
  v.object({
    ref: Ref,
    kind: v.literal('action'),
    screen: Count,
    revision: Count,
    action: Name,
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('local'),
    screen: Count,
    revision: Count,
    local: Name,
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('confirm'),
    screen: Count,
    revision: Count,
    action: Name,
    yes: v.boolean(),
    input: v.optional(v.unknown()),
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('choice'),
    draft: Count,
    field: Name,
    value: ChoiceValue,
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('skip'),
    draft: Count,
    field: Name,
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('page'),
    of: v.picklist(['screen', 'field']),
    owner: Count,
    page: Count,
    label: Label,
  }),
  v.object({
    ref: Ref,
    kind: v.literal('open'),
    address: Address,
    label: Label,
  }),
  v.object({ ref: Ref, kind: v.literal('back'), screen: Count, label: Label }),
  v.object({ ref: Ref, kind: v.literal('home'), label: Label }),
]);

/** Последнее сообщение живого места: текстовое, со ссылками таблицы; не проходит — место в снимке без него. */
export const PlaceMessageSchema = v.object({
  kind: v.literal('text'),
  text: v.pipe(
    v.array(
      v.object({
        text: v.pipe(v.string(), v.maxLength(MAX_FRAGMENT_TEXT)),
        styles: v.pipe(
          v.array(v.picklist(TEXT_STYLES)),
          v.maxLength(TEXT_STYLES.length),
        ),
        link: v.optional(v.pipe(v.string(), v.maxLength(MAX_LINK_LENGTH))),
        moment: v.optional(
          v.object({
            at: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
            show: v.picklist(MOMENT_SHOWS),
          }),
        ),
      }),
    ),
    v.maxLength(MAX_FRAGMENTS),
  ),
  options: v.pipe(
    v.array(
      v.object({
        ref: Ref,
        label: Label,
        accent: v.optional(v.picklist(ACCENTS)),
      }),
    ),
    v.maxLength(MAX_REFS),
  ),
});

const LiveScreen = v.object({
  serial: Count,
  instance: v.unknown(),
  shown: v.pipe(v.string(), v.maxLength(MAX_SHOWN_LENGTH)),
  handles: v.pipe(v.array(v.string()), v.maxLength(MAX_HANDLES)),
  page: Count,
  latest: v.optional(v.boolean()),
  history: v.optional(v.pipe(v.string(), v.regex(HASH_PATTERN))),
  message: v.optional(PlaceMessageSchema),
});

// Вид поля старого снимка не записан — читается как строка. `hint` и
// `example` длиннее `MAX_LABEL_LENGTH` отвергают снимок целиком, как длинная
// подпись (D-UI-100).
const FieldLimits = v.object({
  min: v.optional(v.number()),
  max: v.optional(v.number()),
  integer: v.optional(v.boolean()),
  minLength: v.optional(Count),
  maxLength: v.optional(Count),
});

const Field = v.object({
  name: Name,
  label: Label,
  kind: v.optional(v.picklist(FIELD_KINDS), 'string'),
  optional: v.boolean(),
  hint: v.optional(Label),
  example: v.optional(v.union([Label, v.number(), v.boolean()])),
  limits: v.optional(FieldLimits),
  choices: v.optional(
    v.pipe(
      v.array(v.object({ value: ChoiceValue, label: Label })),
      v.maxLength(MAX_FIELD_CHOICES),
    ),
  ),
  initial: v.optional(v.unknown()),
});

const Draft = v.object({
  serial: Count,
  screen: Count,
  target: v.variant('kind', [
    v.object({
      kind: v.literal('action'),
      action: Name,
      revision: Count,
    }),
    v.object({ kind: v.literal('local'), local: Name, revision: Count }),
  ]),
  fields: v.pipe(v.array(Field), v.maxLength(MAX_FIELDS)),
  values: v.pipe(v.record(Name, ChoiceValue), v.maxEntries(MAX_FIELDS)),
  answered: v.pipe(v.array(Name), v.maxLength(MAX_FIELDS)),
  page: Count,
});

/** Схема снимка беседы: мусор — не по схеме, без броска (`safeParse`). */
export const ConversationSnapshotSchema: v.GenericSchema<
  unknown,
  ConversationSnapshot
> = v.object({
  version: v.literal(1),
  person: v.pipe(v.string(), v.maxLength(MAX_PERSON_LENGTH)),
  serial: Count,
  refs: v.pipe(v.array(RefEntrySchema), v.maxLength(MAX_REFS)),
  seen: v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(MAX_SIGNAL_ID))),
    v.maxLength(MAX_SEEN),
  ),
  notified: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.maxLength(MAX_NOTIFIED_KEY))),
      v.maxLength(MAX_NOTIFIED),
    ),
  ),
  screen: v.optional(LiveScreen),
  draft: v.optional(Draft),
  path: v.optional(v.pipe(v.array(v.unknown()), v.maxLength(MAX_PATH))),
});
