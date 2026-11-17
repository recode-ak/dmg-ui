import type { Graph, GraphRule } from 'dmg-core/graph';
import { TELEGRAM_VIA } from '../../entries/telegram-entries.const';
import { TelegramApps } from '../telegram-apps';
import type { TelegramApp, TelegramPoint } from '../telegram-graph.types';

/**
 * TG-03 (D-UI-64): ключ ведёт на один вход. Команда и меню — одно
 * пространство (в приёме это одно сообщение `/key`), ссылка — своё; один и
 * тот же ключ дважды в приложении — строка с узлами всех точек в порядке `id`
 * (граф хранит узлы отсортированными). Точка с неизвестным способом не считается; `check` не бросает.
 */
export class TelegramDuplicateRule implements GraphRule {
  readonly id = 'TG-03';

  check(graph: Graph): readonly string[] {
    return new TelegramApps(graph)
      .list()
      .flatMap((app) => [
        ...TelegramDuplicateRule.space(app, 'команда', [
          TELEGRAM_VIA.command,
          TELEGRAM_VIA.menu,
        ]),
        ...TelegramDuplicateRule.space(app, 'ссылка', [TELEGRAM_VIA.link]),
      ]);
  }

  /** Повторы ключей среди точек с этими способами; порядок строк — по первой точке ключа. */
  private static space(
    app: TelegramApp,
    word: string,
    vias: readonly string[],
  ): string[] {
    const byKey = new Map<string, TelegramPoint[]>();
    for (const point of app.points) {
      if (!vias.includes(point.via)) continue;
      byKey.set(point.key, [...(byKey.get(point.key) ?? []), point]);
    }
    return [...byKey]
      .filter(([, points]) => points.length > 1)
      .map(
        ([key, points]) =>
          `приложение ${app.id}: ${word} «${key}» объявлена дважды (${points.map((point) => point.id).join(', ')})`,
      );
  }
}
