import type { Graph, GraphRule } from 'dmg-core/graph';
import { TELEGRAM_VIA } from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';

const KNOWN: readonly string[] = Object.values(TELEGRAM_VIA);

/**
 * TG-01 (D-UI-64): способ точки входа известен Telegram — `command`, `menu`
 * или `link`. Читает только узлы `chatEntryPoint`; `check` не бросает.
 */
export class TelegramViaRule implements GraphRule {
  readonly id = 'TG-01';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .flatMap((app) =>
        app.points
          .filter((point) => !KNOWN.includes(point.via))
          .map(
            (point) =>
              `точка ${point.id}: способ «${point.via}» неизвестен Telegram (${KNOWN.join(', ')})`,
          ),
      );
  }
}
