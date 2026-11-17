import { err, ok } from 'dmg-core';
import type { AnyUiAppDef } from 'dmg-ui';
import type { Delivery } from 'dmg-ui/chat-ui';
import type { BotApi, BotCommand } from '../bot-api/bot-api.types';
import { BotApiCaller } from '../bot-api/bot-api-caller';
import { TelegramLog } from '../telegram-log';
import { TELEGRAM_VIA } from './telegram-entries.const';
import type { TelegramMenuSpec } from './telegram-entries.types';

/**
 * Меню команд бота (D-UI-64): `publish` — один `setMyCommands` с командами
 * точек `menu` в порядке таблицы, описание — название входа (`label` из Def
 * приложения), область — личные чаты, `language_code` не задаётся. Точек
 * `menu` нет — вызова нет: список владельца не затирается. Не бросает
 * (ERR-01): отказ — недоставка и `warn`, бросок порта — `unavailable` и
 * `error`; бросок только при сборке — точка `menu` на вход, которого нет в
 * Def. Вызов `publish()` при старте — дело проекта.
 */
export class TelegramMenu {
  private readonly api: BotApi;
  private readonly caller: BotApiCaller;
  private readonly commands: readonly BotCommand[];

  constructor(spec: TelegramMenuSpec) {
    this.api = spec.api;
    this.caller = new BotApiCaller(new TelegramLog(spec.logger));
    this.commands = TelegramMenu.commands(spec);
  }

  async publish(): Promise<Delivery<void>> {
    if (this.commands.length === 0) return ok();
    const outcome = await this.caller.call(
      'setMyCommands',
      () =>
        this.api.setMyCommands({
          commands: this.commands,
          scope: { type: 'all_private_chats' },
        }),
      'publishMenu',
    );
    switch (outcome.kind) {
      case 'done':
        return ok();
      case 'refused':
        return err({ reason: outcome.failure.reason() });
      case 'failed':
        return err({ reason: 'unavailable' });
      default:
        outcome satisfies never;
        return err({ reason: 'unavailable' });
    }
  }

  /** Команды точек `menu` без повторов (первая точка выигрывает); входа нет в Def — бросок сборки. */
  private static commands({
    app,
    entryPoints,
  }: TelegramMenuSpec): readonly BotCommand[] {
    const commands = new Map<string, string>();
    for (const { entry, via, key } of entryPoints) {
      if (via !== TELEGRAM_VIA.menu || commands.has(key)) continue;
      commands.set(key, TelegramMenu.label(app, entry));
    }
    return [...commands].map(([command, description]) => ({
      command,
      description,
    }));
  }

  private static label(app: AnyUiAppDef, entry: string): string {
    if (!Object.hasOwn(app.entries, entry)) {
      throw new Error(
        `TelegramMenu: точка menu ведёт на вход ${entry}, которого нет у приложения ${app.name}`,
      );
    }
    return app.entries[entry]?.label ?? '';
  }
}
