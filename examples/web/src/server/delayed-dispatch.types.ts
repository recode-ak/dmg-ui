import type { Identified } from 'dmg-core';
import type { UcDispatch } from 'dmg-ui/server';

/** Сборка «медленного сервера»: внутренний вызов, задержка и порт ожидания. */
export type DelayedDispatchSpec<U extends Identified> = {
  readonly inner: UcDispatch<U>;
  /** Сколько ждёт задержанная команда, мс; `0` — задержки нет. */
  readonly delayMs: number;
  /** Порт ожидания: по умолчанию настоящее; тест подставляет удержанные промисы. */
  readonly wait?: (ms: number) => Promise<void>;
};
