import { err, ok } from 'dmg-core';
import type { AnyUiAppDef } from 'dmg-ui';
import type { Delivery } from 'dmg-ui/chat-ui';
import type { BotApi, BotCommand } from '../bot-api/bot-api.types';
import { BotApiCaller } from '../bot-api/bot-api-caller';
import { TelegramLog } from '../telegram-log';
import {
  MENU_LIMITS,
  RESERVED_COMMANDS,
  TELEGRAM_VIA,
} from './telegram-entries.const';
import type { TelegramMenuSpec } from './telegram-entries.types';

/**
 * Меню команд бота (D-UI-64): `publish` — один `setMyCommands` с командами
 * точек `menu` по таблице (описание — `label` входа), затем
 * зарезервированными командами беседы в порядке `RESERVED_COMMANDS`, которым
 * проект дал описание (`reserved`, D-UI-127); область — личные чаты. Команд
 * нет — вызова нет: список владельца не затирается.
 *
 * Не бросает (ERR-01): отказ — недоставка и `warn`, бросок порта —
 * `unavailable` и `error`. Бросок только при сборке: точка `menu` на вход,
 * которого нет в Def; описание `reserved` вне 1–256 знаков; с `reserved`
 * команд больше `MENU_LIMITS.commands`. `publish()` при старте — дело
 * проекта.
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

  /**
   * Команды точек `menu` без повторов (первая точка выигрывает), затем
   * зарезервированные с описанием проекта; входа нет в Def, описание вне
   * 1–256 знаков или с зарезервированными команд сверх предела — бросок
   * сборки.
   */
  private static commands({
    app,
    entryPoints,
    reserved = {},
  }: TelegramMenuSpec): readonly BotCommand[] {
    const commands = new Map<string, string>();
    for (const { entry, via, key } of entryPoints) {
      if (via !== TELEGRAM_VIA.menu || commands.has(key)) continue;
      commands.set(key, TelegramMenu.label(app, entry));
    }
    const points = commands.size;
    for (const command of RESERVED_COMMANDS) {
      const description = reserved[command];
      if (description === undefined) continue;
      TelegramMenu.assertDescription(command, description);
      commands.set(command, description);
    }
    // Без `reserved` — как раньше: число точек `menu` сторожит TG-06 графа.
    if (commands.size > points && commands.size > MENU_LIMITS.commands) {
      throw new Error(
        `TelegramMenu: в меню ${commands.size} команд с зарезервированными, предел ${MENU_LIMITS.commands}`,
      );
    }
    return [...commands].map(([command, description]) => ({
      command,
      description,
    }));
  }

  /** Описание зарезервированной команды — 1–256 знаков UTF-16 (`MENU_LIMITS`), иначе бросок сборки. */
  private static assertDescription(command: string, description: string): void {
    const { length } = description;
    if (length < 1 || length > MENU_LIMITS.description) {
      throw new Error(
        `TelegramMenu: описание команды ${command} — ${length} знаков, нужно 1–${MENU_LIMITS.description}`,
      );
    }
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
