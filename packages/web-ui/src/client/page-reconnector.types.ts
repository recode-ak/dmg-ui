import type { PageClock } from './page-clock.types';
import type { PageSocket } from './page-socket.types';

/**
 * Сборка переподключателя: фабрика нового сокета на каждую попытку, часы
 * пауз и срока `hello`, разброс в `[0, 1)` — по умолчанию случайность среды.
 * `faults` — сырые броски `attach`, фабрики и подписки сокета для
 * диагностики: следа операции у переподключателя нет, поэтому не `UiFault`.
 */
export type PageReconnectorSpec = {
  readonly sockets: () => PageSocket;
  readonly clock: PageClock;
  readonly random?: () => number;
  readonly faults?: (error: unknown) => void;
};
