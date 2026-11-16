import type { AnyEventDef, Identified } from 'dmg-core';
import { DeclaredSet } from 'dmg-core/app';
import { AddressCodec } from '../address/address-codec';
import type { CallerSource, UiServerSpec } from './server.types';
import { ServerCalls } from './server-calls';
import { UcRoutes } from './uc-routes';
import { UiSession } from './ui-session';

/**
 * Сервер UI одного набора: маршруты UC узлов, бэкенд вызова и шина.
 * Собирается один раз; на каждую личность канала — `session(source)`.
 */
export class UiServer<U extends Identified> {
  private readonly spec: UiServerSpec<U>;
  private readonly calls: ServerCalls<U>;
  private readonly codec: AddressCodec;
  private readonly listens: ReadonlyMap<string, DeclaredSet<AnyEventDef>>;
  private readonly name: string;

  constructor(spec: UiServerSpec<U>) {
    const nodes = spec.nodes ?? [];
    this.spec = spec;
    this.name = `ui:${spec.set.name}`;
    const { logger } = spec.context;
    const routes = new UcRoutes({
      set: spec.set,
      nodes,
      logger,
      source: this.name,
    });
    this.calls = new ServerCalls({
      routes,
      dispatch: spec.dispatch,
      logger,
      source: this.name,
    });
    this.codec = new AddressCodec(spec.set);
    this.listens = new Map(
      nodes.map((node) => [node.id, new DeclaredSet(node.listens)]),
    );
  }

  /** Сессия личности канала: её порты отдаются исполнителю экранов. */
  session(source: CallerSource<U>): UiSession<U> {
    return new UiSession({
      calls: this.calls,
      codec: this.codec,
      listens: this.listens,
      context: this.spec.context,
      source,
      name: this.name,
    });
  }
}
