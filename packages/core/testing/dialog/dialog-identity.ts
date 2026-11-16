import type { Identified, Trace } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import {
  type CallerSource,
  type RecipientCallers,
  RenderFlags,
} from 'dmg-ui/server';
import type { DialogPlace, RenderContexts } from './dialog.types';
import { DIALOG_CHANNEL } from './dialog-channel.const';

/**
 * Личность диалога: `uuid` → `CallerSource` сессии сервера и контекст
 * рендера (место личности и признаки вызывающего, ФР-7).
 */
export class DialogIdentity<U extends Identified> implements RenderContexts {
  constructor(
    private readonly uuid: string,
    private readonly callers: RecipientCallers<U>,
    private readonly place: DialogPlace,
  ) {}

  source(): CallerSource<U> {
    return {
      subjectId: this.uuid,
      channel: { name: DIALOG_CHANNEL },
      resolve: (trace) => this.callers.resolve(this.uuid, trace),
    };
  }

  /**
   * Контекст рендера на сигнал. Вызывающий не разрешился — признаков нет:
   * вызовы UC той же личности сервер всё равно отклонит.
   */
  async context(trace: Trace): Promise<RenderContext> {
    const caller = await this.callers.resolve(this.uuid, trace);
    const flags = caller.ok
      ? RenderFlags.of(caller.value)
      : { delegate: false, readOnly: false };
    return {
      locale: this.place.locale,
      timeZone: this.place.timeZone,
      delegate: flags.delegate,
      readOnly: flags.readOnly,
    };
  }
}
