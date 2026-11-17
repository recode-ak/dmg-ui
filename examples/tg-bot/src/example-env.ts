import { err, ok, type Result } from 'dmg-core';
import type {
  ExampleEnvError,
  ExampleEnvValue,
  ExampleLogLevel,
} from './example-env.types';

/**
 * Разбор переменных окружения примера (D-UI-68). Сам окружение не читает
 * (ARC-09): переменные передаёт `main.ts`. Тексты отказов называют переменную,
 * но не повторяют значений (токен, id людей).
 */
export class ExampleEnv {
  protected static readonly LEVELS: readonly ExampleLogLevel[] = [
    'debug',
    'info',
    'warn',
    'error',
  ];

  protected static readonly MAX_USERS = 2;

  protected constructor(
    protected readonly input: Readonly<Record<string, string | undefined>>,
  ) {}

  static read(
    input: Readonly<Record<string, string | undefined>>,
  ): Result<ExampleEnvValue, ExampleEnvError> {
    return new ExampleEnv(input).parse();
  }

  protected parse(): Result<ExampleEnvValue, ExampleEnvError> {
    const token = this.optional('EXAMPLE_TG_TOKEN');
    if (token === undefined)
      return this.refuse('EXAMPLE_TG_TOKEN', 'не задана');

    const users = this.users();
    if (!users.ok) return users;

    const logLevel = this.logLevel();
    if (!logLevel.ok) return logLevel;

    const tracePath = this.optional('EXAMPLE_TG_TRACE');
    const dataDir = this.optional('EXAMPLE_TG_DATA');
    return ok({
      token,
      users: users.value,
      logLevel: logLevel.value,
      ...(tracePath !== undefined ? { tracePath } : {}),
      ...(dataDir !== undefined ? { dataDir } : {}),
    });
  }

  /** Пустая строка — как не заданная. */
  protected optional(name: string): string | undefined {
    const value = this.input[name];
    return value === undefined || value === '' ? undefined : value;
  }

  protected users(): Result<number[], ExampleEnvError> {
    const name = 'EXAMPLE_TG_USERS';
    const raw = this.optional(name);
    if (raw === undefined) return this.refuse(name, 'не задана');

    const ids: number[] = [];
    for (const part of raw.split(',')) {
      const id = ExampleEnv.toId(part.trim());
      if (id === undefined) {
        return this.refuse(name, 'каждый id — положительное целое число');
      }
      ids.push(id);
    }
    if (ids.length > ExampleEnv.MAX_USERS) {
      return this.refuse(
        name,
        `допускается не больше ${ExampleEnv.MAX_USERS} id`,
      );
    }
    if (new Set(ids).size !== ids.length) {
      return this.refuse(name, 'id не должны повторяться');
    }
    return ok(ids);
  }

  protected logLevel(): Result<ExampleLogLevel, ExampleEnvError> {
    const raw = this.optional('EXAMPLE_TG_LOG');
    if (raw === undefined) return ok('info');
    const level = ExampleEnv.LEVELS.find((candidate) => candidate === raw);
    return level
      ? ok(level)
      : this.refuse(
          'EXAMPLE_TG_LOG',
          `допустимые значения: ${ExampleEnv.LEVELS.join(', ')}`,
        );
  }

  protected static toId(text: string): number | undefined {
    if (!/^\d+$/.test(text)) return undefined;
    const id = Number(text);
    return Number.isSafeInteger(id) && id > 0 ? id : undefined;
  }

  protected refuse(
    variable: string,
    reason: string,
  ): Result<never, ExampleEnvError> {
    return err({ variable, text: `${variable}: ${reason}` });
  }
}
