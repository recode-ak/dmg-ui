import * as v from 'valibot';
import type { TelegramLog } from '../telegram-log';
import type { TelegramOperation } from '../telegram-log.types';
import type { BotApiMethod, BotApiResult } from './bot-api.types';
import type { BotApiOutcome } from './bot-api-caller.types';
import { BotApiFailure } from './bot-api-failure';
import { BotApiAnswerSchema } from './bot-api-schema';

/**
 * Вызов порта Bot API (D-UI-61): ответ сверен схемой; отказ (кроме «not
 * modified») — `warn`, бросок и ответ не по схеме — `error`. Не бросает
 * (ERR-01): итог — значение. `operation` попадает в запись лога.
 */
export class BotApiCaller {
  constructor(private readonly log: TelegramLog) {}

  async call(
    method: BotApiMethod,
    invoke: () => Promise<BotApiResult<unknown>>,
    operation?: TelegramOperation,
  ): Promise<BotApiOutcome> {
    let answer: unknown;
    try {
      answer = await invoke();
    } catch (error) {
      this.log.failed(method, error, operation);
      return { kind: 'failed' };
    }
    const parsed = v.safeParse(BotApiAnswerSchema, answer);
    if (!parsed.success) {
      this.log.badResult(method, operation);
      return { kind: 'failed' };
    }
    if (parsed.output.ok) return { kind: 'done', result: parsed.output.result };
    const failure = new BotApiFailure(parsed.output);
    if (failure.migrated()) this.log.migrated(method, operation);
    else if (!failure.notModified())
      this.log.refused(method, failure, operation);
    return { kind: 'refused', failure };
  }
}
