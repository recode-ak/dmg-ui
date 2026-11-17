import type { Graph, GraphRule } from 'dmg-core/graph';
import {
  MENU_LIMITS,
  TELEGRAM_VIA,
} from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';
import type { TelegramApp } from '../telegram-graph.types';

/**
 * TG-06 (D-UI-64): меню укладывается в Bot API — точек `menu` не больше 100,
 * название входа (описание команды) — 1–256 знаков UTF-16 (единица в Bot API
 * не названа, берётся строгая). Название — `label` узла входа; точки
 * `command` и `link` в меню не попадают. `check` не бросает.
 */
export class TelegramMenuRule implements GraphRule {
  readonly id = 'TG-06';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .flatMap((app) => TelegramMenuRule.app(app));
  }

  private static app(app: TelegramApp): string[] {
    const menu = app.points.filter((point) => point.via === TELEGRAM_VIA.menu);
    const lines =
      menu.length > MENU_LIMITS.commands
        ? [
            `приложение ${app.id}: в меню ${menu.length} команд из ${MENU_LIMITS.commands}`,
          ]
        : [];
    for (const point of menu) {
      const label = app.entries.get(point.entry);
      if (
        label !== undefined &&
        (label.length < 1 || label.length > MENU_LIMITS.description)
      ) {
        lines.push(
          `точка ${point.id}: описание команды «${point.key}» (название входа ${point.entry}) вне 1–${MENU_LIMITS.description} знаков`,
        );
      }
    }
    return lines;
  }
}
