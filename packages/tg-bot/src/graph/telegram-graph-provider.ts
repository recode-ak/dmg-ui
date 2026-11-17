import type {
  GraphContribution,
  GraphKinds,
  GraphProvider,
  GraphRule,
} from 'dmg-core/graph';
import { TelegramDuplicateRule } from './rules/telegram-duplicate.rule';
import { TelegramKeyRule } from './rules/telegram-key.rule';
import { TelegramMenuRule } from './rules/telegram-menu.rule';
import { TelegramReservedRule } from './rules/telegram-reserved.rule';
import { TelegramStartRule } from './rules/telegram-start.rule';
import { TelegramViaRule } from './rules/telegram-via.rule';
import { TELEGRAM_PROVIDER, TELEGRAM_VERSION } from './telegram-graph.const';

/**
 * Поставщик графа Telegram (D-UI-64): без своих видов и вклада — читает
 * узлы `chatEntryPoint` и рёбра `chatOpens` общей части мессенджеров
 * (`ChatGraphProvider`) и ставит правила TG-01…TG-06 в области приложений
 * UI с мессенджером `telegram`. Приложение Telegram — ещё одно `ChatAppSpec`
 * в `ChatGraphProvider`; поставщик подключается рядом с ним.
 */
export class TelegramGraphProvider implements GraphProvider {
  readonly name = TELEGRAM_PROVIDER;
  readonly version = TELEGRAM_VERSION;

  kinds(): GraphKinds {
    return { nodes: [], edges: [] };
  }

  rules(): readonly GraphRule[] {
    return [
      new TelegramViaRule(),
      new TelegramKeyRule(),
      new TelegramDuplicateRule(),
      new TelegramReservedRule(),
      new TelegramStartRule(),
      new TelegramMenuRule(),
    ];
  }

  contribute(): GraphContribution {
    return { nodes: [], edges: [] };
  }
}
