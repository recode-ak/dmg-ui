import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  err,
  type Identified,
  type SerializedResult,
} from 'dmg-core';
import * as v from 'valibot';
import type { UcCause } from '../runtime/ports.types';
import { CodeDefect } from '../screen/code-defect';
import { ClaimedCause, ClientId } from './client-input';
import type { CallScope, ServerCallsSpec } from './server-calls.types';

export type { CallScope, ServerCallsSpec } from './server-calls.types';

const UcCallJson = v.object({
  module: ClientId,
  uc: ClientId,
  input: v.unknown(),
});

/**
 * Исполнение `UcCall` на сервере: JSON недоверенный. Форма, причина и
 * длины — по схеме, UC — только по паре `(module, uc)` из объявленного
 * стороной вызова, command по событию не исполняется, след и вызывающий —
 * от стороны вызова (`CallScope`), а не от клиента. Отказ —
 * `SerializedResult`, не бросок.
 */
export class ServerCalls<U extends Identified> {
  constructor(private readonly spec: ServerCallsSpec<U>) {}

  /** Вызов из недоверенного JSON (`UcCall` по замыслу); отказ — не бросок. */
  async call(raw: unknown, scope: CallScope<U>): Promise<SerializedResult> {
    const parsed = v.safeParse(UcCallJson, raw);
    if (!parsed.success) return this.invalid('call', 'вызов UC не по схеме');
    const claimed = v.safeParse(ClaimedCause, raw);
    if (!claimed.success) {
      return this.invalid('cause', 'причина вызова UC не по схеме');
    }
    const { module: moduleName, uc: name, input } = parsed.output;
    const route = this.spec.routes.route(moduleName, name);
    if (!route.ok) return ServerCalls.refuse(route.error);
    const { uc, module } = route.value;
    const { requestId, eventId } = claimed.output;
    const cause: UcCause =
      requestId === undefined ? { eventId } : { requestId };
    // Ввод клиента, а не сбой сервера: `warn`, отказ — без подробностей.
    if (uc.type === 'command' && 'eventId' in cause) {
      this.spec.logger.warn(
        this.spec.source,
        'command UC по событию не исполняется',
        { module: moduleName, uc: name },
      );
      return ServerCalls.refuse(CoreErrors.SERVER_INTERNAL.make());
    }
    const trace = scope.trace(cause);
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
        module: moduleName,
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
