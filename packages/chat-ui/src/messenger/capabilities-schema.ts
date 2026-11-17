import * as v from 'valibot';
import { ELLIPSIS } from '../limit/limit.const';
import { TextLength } from '../limit/text-length';
import { MESSAGE_KINDS } from '../message/message.const';
import {
  COMMUNITY_OPERATIONS,
  COMMUNITY_SIGNALS,
  LENGTH_UNITS,
} from './messenger.const';
import type { MessengerCapabilities } from './messenger.types';

// Схема возможностей мессенджера (D-UI-38). Нестрогая: пакет мессенджера
// вправе добавить свои поля — лишние поля схема принимает, на выходе срезает;
// страж и граф берут вход как есть. Пределы — целые не меньше 1; у лимита текста
// предел не меньше длины `…` в его единице (в UTF-8 — 3 байта): иначе
// обрезке некуда поставить знак. Аннотация `GenericSchema<unknown, …>`
// сверяет выход схемы с типом возможностей.

/** Целое не меньше 1. */
const Count = v.pipe(v.number(), v.integer(), v.minValue(1));

const TextLimit = v.pipe(
  v.object({ max: Count, unit: v.picklist(LENGTH_UNITS) }),
  v.check(
    (limit) => limit.max >= new TextLength(limit.unit).ofString(ELLIPSIS),
    'предел лимита короче знака обрезки в его единице',
  ),
);

const Initiative = v.variant('kind', [
  v.object({ kind: v.literal('always') }),
  v.object({ kind: v.literal('afterContact') }),
  v.object({ kind: v.literal('window'), ms: Count }),
]);

/** Схема возможностей: сборка стража и правило графа. */
export const MessengerCapabilitiesSchema: v.GenericSchema<
  unknown,
  MessengerCapabilities
> = v.object({
  name: v.string(),
  kinds: v.pipe(
    v.array(v.picklist(MESSAGE_KINDS)),
    v.check((kinds) => kinds.includes('text'), 'виды сообщений без text'),
  ),
  edit: v.boolean(),
  text: TextLimit,
  textWithOptions: TextLimit,
  options: v.object({ max: Count, label: TextLimit, ref: Count }),
  pressAnswer: v.optional(TextLimit),
  form: v.boolean(),
  initiative: Initiative,
  community: v.object({
    signals: v.array(v.picklist(COMMUNITY_SIGNALS)),
    operations: v.array(v.picklist(COMMUNITY_OPERATIONS)),
  }),
});
