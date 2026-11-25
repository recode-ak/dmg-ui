import type { AddressJson } from 'dmg-ui';

/** Запись входящих для показа: текст и ссылки. */
export type InboxItem = {
  readonly text: string;
  readonly links: readonly AddressJson[];
};
