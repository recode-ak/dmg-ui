import type { Identified, Trace } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import {
  type CallerSource,
  type RecipientCallers,
  RenderContexts,
} from 'dmg-ui/server';
import type { ConversationContexts } from '../conversation/conversation.types';
import type { DialogPlace } from './dialog.types';
import { DIALOG_CHANNEL } from './dialog-channel.const';

/**
 * Личность диалога: `uuid` → `CallerSource` сессии сервера и контекст
 * рендера через `RenderContexts` ядра (место — константа канала, признаки —
 * вызывающего). `uuid` уже доказан транспортом: здесь проверки личности нет.
 */
export class DialogIdentity<U extends Identified>
  implements ConversationContexts
{
  private readonly contexts: RenderContexts<U>;

  constructor(
    private readonly uuid: string,
    private readonly callers: RecipientCallers<U>,
    place: DialogPlace,
  ) {
    this.contexts = new RenderContexts(callers, { place: async () => place });
  }

  source(): CallerSource<U> {
    return {
      subjectId: this.uuid,
      channel: { name: DIALOG_CHANNEL },
      resolve: (trace) => this.callers.resolve(this.uuid, trace),
    };
  }

  /** Контекст рендера на сигнал; вызывающий не разрешился — признаков нет. */
  context(trace: Trace): Promise<RenderContext> {
    return this.contexts.of(this.uuid, trace);
  }
}
