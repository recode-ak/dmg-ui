import { err, ok, type Result } from 'dmg-core';
import {
  EXAMPLE_DEFAULTS,
  EXAMPLE_ENV,
  EXAMPLE_LIMITS,
} from './example-env.const';
import type {
  ExampleEnvError,
  ExampleEnvValue,
  ExampleLogLevel,
} from './example-env.types';

/**
 * Разбор переменных окружения примера. Сам окружение не читает (ARC-09):
 * переменные передаёт `main.ts`. Тексты отказов называют переменную, но не
 * повторяют значений. Пустая строка — как не заданная.
 */
export class ExampleEnv {
  protected static readonly LEVELS: readonly ExampleLogLevel[] = [
    'debug',
    'info',
    'warn',
    'error',
  ];

  protected constructor(
    protected readonly input: Readonly<Record<string, string | undefined>>,
  ) {}

  static read(
    input: Readonly<Record<string, string | undefined>>,
  ): Result<ExampleEnvValue, ExampleEnvError> {
    return new ExampleEnv(input).parse();
  }

  protected parse(): Result<ExampleEnvValue, ExampleEnvError> {
    const port = this.integer(
      EXAMPLE_ENV.port,
      EXAMPLE_DEFAULTS.port,
      1,
      EXAMPLE_LIMITS.portMax,
    );
    if (!port.ok) return port;
    const delayMs = this.integer(
      EXAMPLE_ENV.delay,
      EXAMPLE_DEFAULTS.delayMs,
      0,
      EXAMPLE_LIMITS.delayMax,
    );
    if (!delayMs.ok) return delayMs;
    const logLevel = this.logLevel();
    if (!logLevel.ok) return logLevel;
    const dataDir = this.optional(EXAMPLE_ENV.data);
    return ok({
      port: port.value,
      delayMs: delayMs.value,
      logLevel: logLevel.value,
      ...(dataDir !== undefined ? { dataDir } : {}),
    });
  }

  protected optional(name: string): string | undefined {
    const value = this.input[name];
    return value === undefined || value === '' ? undefined : value;
  }

  /** Целое число в пределах; не задано — значение по умолчанию. */
  protected integer(
    name: string,
    fallback: number,
    min: number,
    max: number,
  ): Result<number, ExampleEnvError> {
    const raw = this.optional(name);
    if (raw === undefined) return ok(fallback);
    const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    return value >= min && value <= max
      ? ok(value)
      : this.refuse(name, `целое число от ${min} до ${max}`);
  }

  protected logLevel(): Result<ExampleLogLevel, ExampleEnvError> {
    const raw = this.optional(EXAMPLE_ENV.log);
    if (raw === undefined) return ok('info');
    const level = ExampleEnv.LEVELS.find((candidate) => candidate === raw);
    return level
      ? ok(level)
      : this.refuse(
          EXAMPLE_ENV.log,
          `допустимые значения: ${ExampleEnv.LEVELS.join(', ')}`,
        );
  }

  protected refuse(
    variable: string,
    reason: string,
  ): Result<never, ExampleEnvError> {
    return err({ variable, text: `${variable}: ${reason}` });
  }
}
