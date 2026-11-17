import type { Graph, GraphRule } from 'dmg-core/graph';
import {
  START_COMMAND,
  TELEGRAM_VIA,
} from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';

/**
 * TG-05 (D-UI-64): новичок попадает в бота. Кнопка «Запустить» в пустом
 * чате шлёт `/start`; без точки `command` или `menu` с ключом `start` он
 * получит «Такого входа нет». У приложения без входов правило молчит;
 * отсутствие точки у входа — дело CH-02. `check` не бросает.
 */
export class TelegramStartRule implements GraphRule {
  readonly id = 'TG-05';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .filter(
        (app) =>
          app.entries.size > 0 &&
          !app.points.some(
            (point) =>
              point.key === START_COMMAND &&
              (point.via === TELEGRAM_VIA.command ||
                point.via === TELEGRAM_VIA.menu),
          ),
      )
      .map((app) => `приложение ${app.id}: нет точки входа для /start`);
  }
}
