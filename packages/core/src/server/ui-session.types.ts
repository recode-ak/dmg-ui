import type { AnyEventDef, Identified } from 'dmg-core';
import type { DeclaredSet } from 'dmg-core/app';
import type { AddressCodec } from '../address/address-codec';
import type { CallerSource, ServerContext } from './server.types';
import type { ServerCalls } from './server-calls';

/** Что сессии даёт `UiServer`: общие маршруты, кодек, события узлов канала. */
export type UiSessionSpec<U extends Identified> = {
  readonly calls: ServerCalls<U>;
  readonly codec: AddressCodec;
  readonly listens: ReadonlyMap<string, DeclaredSet<AnyEventDef>>;
  readonly context: ServerContext;
  readonly source: CallerSource<U>;
  /** Источник подписчика событий и записей лога: `ui:<набор>`. */
  readonly name: string;
};
