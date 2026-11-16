import type { Identified, Trace } from 'dmg-core';
import type { RenderContext } from '../runtime/context.types';
import { RenderFlags } from './render-flags';
import type { PersonPlaces, RecipientCallers } from './server.types';

/**
 * Контекст рендера личности (D-UI-41): место — из порта по uuid того, кто
 * работает, признаки — `RenderFlags` вызывающего. Состояния не держит.
 */
export class RenderContexts<U extends Identified> {
  constructor(
    private readonly callers: RecipientCallers<U>,
    private readonly places: PersonPlaces,
  ) {}

  /** Вызывающий не разрешился — признаков нет: вызов UC сервер всё равно отклонит. */
  async of(uuid: string, trace: Trace): Promise<RenderContext> {
    const [place, caller] = await Promise.all([
      this.places.place(uuid, trace),
      this.callers.resolve(uuid, trace),
    ]);
    const flags = caller.ok ? RenderFlags.of(caller.value) : undefined;
    return {
      locale: place.locale,
      timeZone: place.timeZone,
      delegate: flags?.delegate ?? false,
      readOnly: flags?.readOnly ?? false,
    };
  }
}
