import type * as v from 'valibot';

/** Что проверяется в примере: имя схемы, схема и значение. */
export type ExamplePart = {
  readonly schema: string;
  readonly def: v.GenericSchema | undefined;
  readonly value: unknown;
};

/** Пример: имя и проверяемые части. */
export type ExampleSample = {
  readonly name: string;
  readonly parts: readonly ExamplePart[];
};
