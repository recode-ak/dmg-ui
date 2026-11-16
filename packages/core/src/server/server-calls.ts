import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  err,
  type Identified,
  type SerializedResult,
} from 'dmg-core';
import { Trace } from 'dmg-core/app';
import * as v from 'valibot';
import type { UcCall } from '../runtime/ports.types';
import type { ResolveCaller, ServerCallsSpec } from './server-calls.types';

export type { ResolveCaller, ServerCallsSpec } from './server-calls.types';

const UcCallJson = v.object({
  node: v.string(),
  uc: v.string(),
  input: v.unknown(),
  trace: v.unknown(),
});

/**
 * Исполнение `UcCall` на сервере: JSON недоверенный. Форма и след — по
 * схеме, UC — только объявленный узлом, command по событию не исполняется,
 * вызывающий — от сервера на каждый вызов. Отказ — `SerializedResult`, не бросок.
 */
export class ServerCalls<U extends Identified> {
  constructor(private readonly spec: ServerCallsSpec<U>) {}

  async call(
    raw: UcCall,
    resolve: ResolveCaller<U>,
  ): Promise<SerializedResult> {
    const parsed = v.safeParse(UcCallJson, raw);
    const trace = parsed.success
      ? ServerCalls.traceOf(parsed.output.trace)
      : undefined;
    if (!parsed.success || trace === undefined) {
      this.spec.logger.warn(this.spec.source, 'вызов UC не по схеме');
      return ServerCalls.refuse(
        CoreErrors.INPUT_VALIDATION.make({
          issues: [{ path: 'call', message: 'вызов UC не по схеме' }],
        }),
      );
    }
    const { node, uc: name, input } = parsed.output;
    const route = this.spec.routes.route(node, name);
    if (!route.ok) return ServerCalls.refuse(route.error);
    const { uc, module } = route.value;
    if (uc.type === 'command' && trace.cause.kind === 'event') {
      this.spec.logger.error(
        this.spec.source,
        'command UC со следом события не исполняется',
        { node, uc: name, correlationId: trace.correlationId },
      );
      return ServerCalls.refuse(CoreErrors.SERVER_INTERNAL.make());
    }
    try {
      const caller = await resolve(trace);
      if (!caller.ok) return ServerCalls.refuse(caller.error);
      return await this.spec.dispatch.dispatch({
        module,
        uc,
        input,
        caller: caller.value,
        trace,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.spec.logger.error(this.spec.source, 'сбой вызова UC', {
        node,
        uc: name,
        correlationId: trace.correlationId,
        error: text,
      });
      return ServerCalls.refuse(CoreErrors.SERVER_INTERNAL.make());
    }
  }

  /** След из JSON; мусор — `undefined`, а не бросок наружу. */
  private static traceOf(json: unknown): Trace | undefined {
    try {
      return Trace.fromJSON(json);
    } catch {
      return undefined;
    }
  }

  private static refuse(error: DomainError): SerializedResult {
    return err(ErrorDef.serialize(error));
  }
}
