import type { PageClient } from 'dmg-ui/web-ui';

/** Порт клиента вкладки, которым пользуются жесты. */
export type GesturePort = Pick<
  PageClient,
  | 'submitInput'
  | 'submit'
  | 'local'
  | 'confirm'
  | 'close'
  | 'retry'
  | 'openLink'
  | 'route'
>;

/** Область, которую можно закрыть: у основной закрытия нет. */
export type ClosableRegion = Parameters<PageClient['close']>[0];
