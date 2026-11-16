import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  err,
  type Identified,
  type SerializedResult,
} from 'dmg-core';
import * as v from 'valibot';
import type { UcCall } from '../runtime/ports.types';
import { CodeDefect } from '../screen/code-defect';
import type { CallScope, ServerCallsSpec } from './server-calls.types';

export type {
  CallScope,
  ClaimedTrace,
  ServerCallsSpec,
} from './server-calls.types';

/** Предел длины строк клиента: узел, UC и идентификаторы следа. */
const MAX_LENGTH = 256;

const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_LENGTH));

// `generated` и `channel` клиента схема не берёт; причина-прогон Job — отказ.
const ClaimedTraceJson = v.object({
  cause: v.variant('kind', [
    v.object({ kind: v.literal('request'), requestId: Id }),
    v.object({ kind: v.literal('event'), eventId: Id }),
  ]),
  correlationId: Id,
});

const UcCallJson = v.object({
  node: Id,
  uc: Id,
  input: v.unknown(),
  trace: ClaimedTraceJson,
});

/**
 * Исполнение `UcCall` на сервере: JSON недоверенный. Форма и длины — по
 * схеме, UC — только объявленный узлом, command по событию не исполняется,
 * след и вызывающий — от стороны вызова (`CallScope`), а не от клиента.
 * Отказ — `SerializedResult`, не бросок.
 */
export class ServerCalls<U extends Identified> {
  constructor(private readonly spec: ServerCallsSpec<U>) {}

  async call(raw: UcCall, scope: CallScope<U>): Promise<SerializedResult> {
    const parsed = v.safeParse(UcCallJson, raw);
    if (!parsed.success) return this.invalid('call', 'вызов UC не по схеме');
    const { node, uc: name, input, trace: claimed } = parsed.output;
    const route = this.spec.routes.route(node, name);
    if (!route.ok) return ServerCalls.refuse(route.error);
    const { uc, module } = route.value;
    if (uc.type === 'command' && claimed.cause.kind === 'event') {
      this.spec.logger.error(
        this.spec.source,
        'command UC со следом события не исполняется',
        { node, uc: name, correlationId: claimed.correlationId },
      );
      return ServerCalls.refuse(CoreErrors.SERVER_INTERNAL.make());
    }
    const trace = scope.trace(claimed);
    if (trace === undefined) return this.invalid('trace', 'след не принят');
    try {
      const caller = await scope.resolve(trace);
      if (!caller.ok) return ServerCalls.refuse(caller.error);
      return await this.spec.dispatch.dispatch({
        module,
        uc,
        input,
        caller: caller.value,
        trace,
      });
    } catch (error) {
      this.spec.logger.error(this.spec.source, 'сбой вызова UC', {
        node,
        uc: name,
        correlationId: trace.correlationId,
        error: CodeDefect.textOf(error, 'вызов UC'),
      });
      return ServerCalls.refuse(CoreErrors.SERVER_INTERNAL.make());
    }
  }

  private invalid(path: string, message: string): SerializedResult {
    this.spec.logger.warn(this.spec.source, message);
    return ServerCalls.refuse(
      CoreErrors.INPUT_VALIDATION.make({ issues: [{ path, message }] }),
    );
  }

  private static refuse(error: DomainError): SerializedResult {
    return err(ErrorDef.serialize(error));
  }
}
