import { Address } from '../address/address';
import { AddressCodec } from '../address/address-codec';
import { UiIds } from '../address/ui-ids';
import { AppReach } from '../manifest/app-reach';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AppCodeLoaders } from './app-code-loaders';
import type { RenderContext } from './context.types';
import { ExampleCheck } from './example-check';
import { InstanceViews } from './instance-views';
import type { InstanceView } from './outcome.types';
import type {
  NotificationPreview,
  ScreenPreviewSpec,
} from './screen-preview.types';

export type {
  NotificationPreview,
  ScreenPreviewSpec,
} from './screen-preview.types';

/**
 * Вид экрана и данные уведомления по именованному примеру Def — для
 * каталога, снимков и тестов представлений. Порты, наблюдатель и `load`
 * кода не зовутся; ошибка в примере — бросок `CodeDefect`. Приложения UI у
 * превью нет: действия составом приложения не отрезаются.
 */
export class ScreenPreview {
  private readonly codes: AppCodeLoaders;
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;

  /** Сборка кода не набора превью (другого набора, приложения) — бросок. */
  constructor(spec: ScreenPreviewSpec) {
    if (spec.codes.set !== spec.set || spec.codes.app !== undefined) {
      throw new Error(
        `ScreenPreview: загрузчики кода ${spec.codes.scopeName()}, а превью — набора ${spec.set.name}`,
      );
    }
    this.codes = spec.codes;
    this.ids = new UiIds(spec.set);
    this.codec = new AddressCodec(spec.set);
  }

  /**
   * Вид экрана по примеру: `ready`, ревизия 0, действия — кодом экрана в
   * контексте рендера; состояние без примера — `initialState` кода.
   */
  async screen(
    def: AnyScreenDef,
    example: string,
    context: RenderContext,
  ): Promise<InstanceView> {
    const unit = await this.codes.screen(def);
    const frame = unit.exampleFrame(example);
    const address = this.codec.encode(new Address(def, frame.params));
    const views = new InstanceViews(
      unit,
      this.ids.screen(def),
      address,
      context,
      AppReach.of(undefined),
    );
    return views.view(0, views.ready(frame));
  }

  /** Данные уведомления по примеру; ссылок нет — у примера нет payload. */
  notification(def: AnyNotificationDef, example: string): NotificationPreview {
    const notification = this.ids.notification(def);
    const check = new ExampleCheck(`Уведомление ${def.name}`);
    const found = check.find(def.examples, example);
    const data = check.value(def.data, found.data, `пример ${example}: data`);
    return { notification, data };
  }
}
