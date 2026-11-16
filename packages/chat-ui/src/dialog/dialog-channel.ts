import type { Identified } from 'dmg-core';
import { ScreenRuntime } from 'dmg-ui';
import { Dialog } from './dialog';
import type { DialogChannelSpec } from './dialog.types';
import {
  DIALOG_CHANNEL,
  DIALOG_HOME,
  DIALOG_PLACE,
} from './dialog-channel.const';
import { DialogDelivery } from './dialog-delivery';
import { DialogIdentity } from './dialog-identity';
import { DialogRenderer } from './dialog-renderer';
import { DialogReplies } from './dialog-replies';
import { DialogTraces } from './dialog-traces';

/**
 * Учебный диалоговый канал одного приложения UI: сервер одного процесса,
 * диалог личности — фасад над беседой (один живой экран, вход действия по
 * шагам). Знает
 * только публичные входы `dmg-ui`, `dmg-ui/server`, `dmg-ui/graph` и
 * `dmg-core` — так доказывает, что каналу хватает контракта ядра.
 *
 * Допущения учебного канала:
 * - личность — `uuid` аргументом `person`/`resume`; `identities` личность
 *   не доказывает, а лишь строит вызывающего. Боевой канал берёт `uuid`
 *   только из аутентифицированной личности транспорта, не из данных запроса;
 * - `close` нет: карта диалогов и сессии сервера не освобождаются.
 */
export class DialogChannel<U extends Identified> {
  readonly delivery: DialogDelivery;
  private readonly spec: DialogChannelSpec<U>;
  private readonly replies: DialogReplies;
  private readonly traces: DialogTraces;
  private readonly dialogs = new Map<string, Dialog>();

  /** Приложение другого канала, набора или без входа `start` — бросок. */
  constructor(spec: DialogChannelSpec<U>) {
    const { app, views } = spec;
    if (app.channel !== DIALOG_CHANNEL) {
      throw new Error(
        `DialogChannel: приложение ${app.name} канала ${app.channel}, а не ${DIALOG_CHANNEL}`,
      );
    }
    if (views.set !== app.set) {
      throw new Error(
        `DialogChannel: представления набора ${views.set.name}, а приложение — ${app.set.name}`,
      );
    }
    if (app.entries[DIALOG_HOME] === undefined) {
      throw new Error(
        `DialogChannel: у приложения ${app.name} нет входа ${DIALOG_HOME}`,
      );
    }
    this.spec = spec;
    this.replies = new DialogReplies(views);
    this.traces = new DialogTraces(
      spec.requestIds ?? (() => crypto.randomUUID()),
    );
    this.delivery = new DialogDelivery((uuid) => this.person(uuid));
  }

  /** Диалог личности — один на `uuid`: сессия сервера и исполнитель экранов. */
  person(uuid: string): Dialog {
    const known = this.dialogs.get(uuid);
    if (known !== undefined) return known;
    const { app, codes, server, observer, identities } = this.spec;
    const identity = new DialogIdentity(
      uuid,
      identities(uuid),
      this.spec.place ?? DIALOG_PLACE,
    );
    const session = server.session(identity.source());
    const dialog = new Dialog({
      app,
      runtime: new ScreenRuntime({
        set: app.set,
        codes,
        ucs: session,
        refresh: session,
        observer,
      }),
      identity,
      traces: this.traces,
      replies: this.replies,
      person: uuid,
    });
    this.dialogs.set(uuid, dialog);
    return dialog;
  }

  /** Восстановить диалог личности из снимка (внешние данные). */
  resume(uuid: string, json: unknown): Promise<void> {
    return this.person(uuid).resume(json);
  }

  /** Рендер видов и уведомлений в текст без живого диалога (удобство: `new DialogRenderer(views)`). */
  renderer(): DialogRenderer {
    return new DialogRenderer(this.spec.views);
  }
}
