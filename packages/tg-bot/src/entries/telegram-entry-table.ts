import type { ChatEntryPointSpec } from 'dmg-ui/chat-ui';
import { TELEGRAM_VIA } from './telegram-entries.const';

/**
 * Таблица точек входа Telegram (D-UI-64): по имени команды и по параметру
 * ссылки отдаёт имя входа приложения. `command` и `menu` — одно пространство
 * (в приёме это одно сообщение `/key`), `link` — своё. Повтор ключа — первая
 * запись выигрывает; точка с неизвестным способом пропускается. Регистр и
 * формат ключа не трактует: имя команды в нижний регистр приводит приём,
 * формат проверяет TG-02. Ключи — в `Map`: имена прототипа входами не бывают.
 */
export class TelegramEntryTable {
  private readonly commands = new Map<string, string>();
  private readonly links = new Map<string, string>();

  constructor(entryPoints: readonly ChatEntryPointSpec[]) {
    for (const { entry, via, key } of entryPoints) {
      switch (via) {
        case TELEGRAM_VIA.command:
        case TELEGRAM_VIA.menu:
          if (!this.commands.has(key)) this.commands.set(key, entry);
          break;
        case TELEGRAM_VIA.link:
          if (!this.links.has(key)) this.links.set(key, entry);
          break;
        default:
          break;
      }
    }
  }

  /** Вход точки `command`/`menu` с этим именем команды. */
  command(name: string): string | undefined {
    return this.commands.get(name);
  }

  /** Вход точки `link` с этим параметром ссылки. */
  link(param: string): string | undefined {
    return this.links.get(param);
  }
}
