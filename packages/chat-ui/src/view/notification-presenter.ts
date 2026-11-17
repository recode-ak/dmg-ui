import type { AnyNotificationDef } from 'dmg-ui';
import * as v from 'valibot';
import type {
  AnyNotificationPresenter,
  NotificationRender,
} from './view.types';

/** Представление уведомления в беседе: текст по данным. */
export class NotificationPresenter<D extends AnyNotificationDef>
  implements AnyNotificationPresenter
{
  private constructor(
    readonly def: D,
    private readonly render: NotificationRender<D>,
  ) {}

  static for<D extends AnyNotificationDef>(
    def: D,
    render: NotificationRender<D>,
  ): NotificationPresenter<D> {
    return new NotificationPresenter(def, render);
  }

  /** Данные пришли от сервера: проверка схемой уведомления, не приведение. */
  text(data: unknown): string {
    return this.render(v.parse(this.def.data, data));
  }
}
