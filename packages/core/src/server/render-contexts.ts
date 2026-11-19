import type { Identified, Trace } from 'dmg-core';
import { RenderFlags } from './render-flags';
import type {
  CallerContext,
  PersonPlaces,
  RecipientCallers,
} from './server.types';

/**
 * Контекст рендера личности (D-UI-41): место — из порта по uuid того, кто
 * работает, признаки — `RenderFlags` вызывающего, субъект — `subject()`
 * вызывающего (у заместителя — принципал), тот же объект, что получает
 * Policy (D-UI-98). Состояния не держит.
 */
export class RenderContexts<U extends Identified> {
  constructor(
    private readonly callers: RecipientCallers<U>,
    private readonly places: PersonPlaces,
  ) {}

  /**
   * Вызывающий не разрешился — признаков и субъекта нет: вызов UC сервер
   * всё равно отклонит.
   */
  async of(uuid: string, trace: Trace): Promise<CallerContext<U>> {
    const [place, caller] = await Promise.all([
      this.places.place(uuid, trace),
      this.callers.resolve(uuid, trace),
    ]);
    const flags = caller.ok ? RenderFlags.of(caller.value) : undefined;
    const subject = caller.ok ? caller.value.subject() : undefined;
    return {
      locale: place.locale,
      timeZone: place.timeZone,
      delegate: flags?.delegate ?? false,
      readOnly: flags?.readOnly ?? false,
      ...(subject === undefined ? {} : { subject }),
    };
  }
}
