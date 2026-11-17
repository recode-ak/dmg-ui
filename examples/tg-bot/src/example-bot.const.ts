import type { ChatEntryPointSpec } from 'dmg-ui/chat-ui';
import { TELEGRAM_VIA } from 'dmg-ui/tg-bot';

/** uuid пользователя A учебного мира: первый id из `EXAMPLE_TG_USERS`. */
export const EXAMPLE_USER_A = '00000000-0000-4000-8000-000000000001';

/** uuid пользователя B учебного мира: второй id из `EXAMPLE_TG_USERS`; его вводят в «Назначить». */
export const EXAMPLE_USER_B = '00000000-0000-4000-8000-000000000002';

/**
 * Точки входа примера: `start` и `assigned` — пункты меню (они же
 * команды: `command` и `menu` делят ключи), `link` ведёт на вход `start`.
 */
export const ENTRY_POINTS = [
  { entry: 'start', via: TELEGRAM_VIA.menu, key: 'start' },
  { entry: 'assigned', via: TELEGRAM_VIA.menu, key: 'assigned' },
  { entry: 'start', via: TELEGRAM_VIA.link, key: 'hello' },
] as const satisfies readonly ChatEntryPointSpec[];
