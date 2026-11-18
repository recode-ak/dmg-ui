import type { Result } from 'dmg-core';
import type { Address } from 'dmg-ui';
import type { PageUrlRejection } from './page-urls.types';

/**
 * Разобранная ссылка с составом областей: адрес основной области и области,
 * чей ключ был в ссылке, — адрес или причина отказа вложенного URL.
 */
export type PageLayoutParse = {
  readonly main: Address;
  readonly regions: Readonly<Record<string, Result<Address, PageUrlRejection>>>;
};
