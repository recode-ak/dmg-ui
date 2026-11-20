import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type AnyEventDef,
  type Caller,
  type Command,
  type DomainError,
  ok,
  type Result,
  type SerializedResult,
  type Trace,
  UserCaller,
} from 'dmg-core';
import type { CommandTransport, EventEnvelope } from 'dmg-core/app';
import type { ExampleUser } from 'dmg-core/testing/example';

// Заглушки сторон сервера UI для тестов `src/server/` и сквозного теста:
// транспорт команды, источник вызывающего, доставка и лог операций. Типов
// `src/server/` не импортирует — подходит к ним структурно.

export const T0 = Date.UTC(2026, 9, 1);

/** Пользователь учебного приложения без ролей. */
export const exampleUser = (uuid: string): ExampleUser => ({
  uuid,
  hasRole: () => false,
});

/** Отправленная транспортом команда. */
export type SentCommand = {
  readonly module: string;
  readonly command: Command;
  readonly caller: Caller<ExampleUser>;
  readonly trace: Trace;
};

/** Транспорт `ModuleApi`: записывает команды, отвечает заданным по имени UC. */
export class StubTransport implements CommandTransport<ExampleUser> {
  readonly sent: SentCommand[] = [];
  private readonly answers = new Map<string, SerializedResult>();

  answer(uc: string, result: SerializedResult): this {
    this.answers.set(uc, result);
    return this;
  }

  async send(
    module: string,
    command: Command,
    caller: Caller<ExampleUser>,
    trace: Trace,
  ): Promise<SerializedResult> {
    this.sent.push({ module, command, caller, trace });
    return this.answers.get(command.uc) ?? ok({});
  }

  /** Имена отправленных UC по порядку. */
  names(): string[] {
    return this.sent.map((entry) => entry.command.uc);
  }
}

/** Источник вызывающего канала: личность `uuid`, следы разрешений по порядку. */
export class StubCallerSource {
  readonly traces: Trace[] = [];

  constructor(
    readonly subjectId: string,
    private readonly refusal?: DomainError,
  ) {}

  async resolve(
    trace: Trace,
  ): Promise<Result<Caller<ExampleUser>, DomainError>> {
    this.traces.push(trace);
    if (this.refusal !== undefined) return { ok: false, error: this.refusal };
    return ok(new UserCaller(exampleUser(this.subjectId)));
  }
}

/** Вызывающие получателей уведомления: отказ — для uuid из `refused`. */
export class StubRecipientCallers {
  readonly resolved: string[] = [];

  constructor(private readonly refused = new Map<string, DomainError>()) {}

  async resolve(
    uuid: string,
    _trace: Trace,
  ): Promise<Result<Caller<ExampleUser>, DomainError>> {
    this.resolved.push(uuid);
    const refusal = this.refused.get(uuid);
    if (refusal !== undefined) return { ok: false, error: refusal };
    return ok(new UserCaller(exampleUser(uuid)));
  }
}

/** Доставка уведомлений: складывает доставленное. */
export class StubDelivery {
  readonly delivered: unknown[] = [];

  async deliver(notification: unknown): Promise<void> {
    this.delivered.push(notification);
  }
}

/** Конверт события `def` с причиной-запросом `correlationId`. */
export const envelopeOf = (
  def: AnyEventDef,
  payload: Readonly<Record<string, unknown>>,
  eventId: string,
  correlationId = 'r-cause',
): EventEnvelope => ({
  name: def.name,
  payload,
  eventId,
  occurredAt: T0,
  aggregateId: eventId,
  cause: { kind: 'request', requestId: correlationId },
  correlationId,
});

/** Записи лога операций каталога данных учебного приложения. */
export const oplogRecords = (dataDir: string): Record<string, unknown>[] => {
  const dir = join(dataDir, 'oplog');
  return readdirSync(dir)
    .filter((file) => file.endsWith('.jsonl'))
    .flatMap((file) => readFileSync(join(dir, file), 'utf8').trim().split('\n'))
    .map((line) => JSON.parse(line));
};
