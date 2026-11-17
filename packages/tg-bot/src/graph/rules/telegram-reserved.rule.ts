import type { Graph, GraphRule } from 'dmg-core/graph';
import {
  RESERVED_COMMANDS,
  TELEGRAM_VIA,
} from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';

const RESERVED: readonly string[] = RESERVED_COMMANDS;

/**
 * TG-04 (D-UI-64): команда не занимает имя беседы. `cancel` и `back` приём
 * отдаёт беседе раньше таблицы, точка `command`/`menu` с таким ключом
 * недостижима; `check` не бросает.
 */
export class TelegramReservedRule implements GraphRule {
  readonly id = 'TG-04';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .flatMap((app) =>
        app.points
          .filter(
            (point) =>
              (point.via === TELEGRAM_VIA.command ||
                point.via === TELEGRAM_VIA.menu) &&
              RESERVED.includes(point.key),
          )
          .map(
            (point) =>
              `точка ${point.id}: команда «${point.key}» занята беседой (${RESERVED.join(', ')})`,
          ),
      );
  }
}
