import type { Graph, GraphRule } from 'dmg-core/graph';
import {
  COMMAND_KEY,
  COMMAND_KEY_FORMAT,
  LINK_KEY,
  LINK_KEY_FORMAT,
  TELEGRAM_VIA,
} from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';
import type { TelegramPoint } from '../telegram-graph.types';

/**
 * TG-02 (D-UI-64): ключ точки — по правилам Bot API. У `command` и `menu` —
 * имя команды, у `link` — параметр глубокой ссылки; формат тот же, что у
 * приёма апдейтов. Регистр входящих команд правило не знает (единица —
 * нижний). Точка с неизвестным способом — дело TG-01; `check` не бросает.
 */
export class TelegramKeyRule implements GraphRule {
  readonly id = 'TG-02';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .flatMap((app) =>
        app.points.flatMap((point) => TelegramKeyRule.point(point)),
      );
  }

  private static point(point: TelegramPoint): string[] {
    const format = TelegramKeyRule.format(point.via);
    if (format === undefined || format.pattern.test(point.key)) return [];
    return [
      `точка ${point.id}: ключ «${point.key}» не по правилам Bot API (${format.text})`,
    ];
  }

  private static format(
    via: string,
  ): { pattern: RegExp; text: string } | undefined {
    switch (via) {
      case TELEGRAM_VIA.command:
      case TELEGRAM_VIA.menu:
        return { pattern: COMMAND_KEY, text: COMMAND_KEY_FORMAT };
      case TELEGRAM_VIA.link:
        return { pattern: LINK_KEY, text: LINK_KEY_FORMAT };
      default:
        return undefined;
    }
  }
}
