import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type AnyUiSetDef,
  ScreenPreview,
  UiIds,
} from 'dmg-ui';
import * as v from 'valibot';
import { CHAT_EXAMPLES_CONTEXT } from './chat-examples.const';
import type {
  ChatExamplesSpec,
  ChatNotificationExample,
  ChatScreenExample,
} from './chat-examples.types';

export type {
  ChatExamplesSpec,
  ChatNotificationExample,
  ChatScreenExample,
} from './chat-examples.types';

/**
 * Примеры набора для CH-01 (`ExampleLimits`, D-UI-58): вид экрана по
 * примеру — `Promise`, собирает тест (`await collect`), а `check` меры —
 * синхронный. Пример не по схеме пропускается — нарушение даёт UI-20;
 * загрузчики другого набора — бросок `ScreenPreview`. Чистый класс данных.
 */
export class ChatExamples {
  private constructor(
    readonly set: AnyUiSetDef,
    private readonly screenExamples: readonly ChatScreenExample[],
    private readonly notificationExamples: readonly ChatNotificationExample[],
  ) {}

  /** Виды всех примеров экранов и данные всех примеров уведомлений набора. */
  static async collect(spec: ChatExamplesSpec): Promise<ChatExamples> {
    const preview = new ScreenPreview({ set: spec.set, codes: spec.codes });
    const context = spec.context ?? CHAT_EXAMPLES_CONTEXT;
    const ids = new UiIds(spec.set);
    const screens = spec.set.modules.flatMap((module) => module.screens);
    const notifications = spec.set.modules.flatMap(
      (module) => module.notifications ?? [],
    );
    const views = await Promise.all(
      screens.flatMap((def) =>
        ChatExamples.validScreenExamples(def).map(
          async (name): Promise<ChatScreenExample> => ({
            id: ids.screen(def),
            name,
            view: await preview.screen(def, name, context),
          }),
        ),
      ),
    );
    const data = notifications.flatMap((def) =>
      ChatExamples.validNotificationExamples(def).map(
        (name): ChatNotificationExample => ({
          id: ids.notification(def),
          name,
          data: preview.notification(def, name).data,
        }),
      ),
    );
    return new ChatExamples(spec.set, views, data);
  }

  /** Виды примеров экранов: `{ id, name, view }`. */
  screens(): readonly ChatScreenExample[] {
    return this.screenExamples;
  }

  /** Данные примеров уведомлений: `{ id, name, data }`. */
  notifications(): readonly ChatNotificationExample[] {
    return this.notificationExamples;
  }

  /** Имена примеров экрана по схемам `params`, `data`, `state` — как их проверяет превью. */
  private static validScreenExamples(def: AnyScreenDef): string[] {
    return Object.entries(def.examples)
      .filter(
        ([, example]) =>
          v.is(def.params, example.params) &&
          v.is(def.data, example.data) &&
          (def.state === undefined ||
            example.state === undefined ||
            v.is(def.state, example.state)),
      )
      .map(([name]) => name);
  }

  /** Имена примеров уведомления по схеме `data`. */
  private static validNotificationExamples(def: AnyNotificationDef): string[] {
    return Object.entries(def.examples)
      .filter(([, example]) => v.is(def.data, example.data))
      .map(([name]) => name);
  }
}
