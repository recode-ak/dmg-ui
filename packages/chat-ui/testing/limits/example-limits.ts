import { type AnyNotificationDef, UiIds } from 'dmg-ui';
import {
  type AppChatViews,
  type MessengerCapabilities,
  MessengerCapabilitiesSchema,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import type { ChatExamples } from './chat-examples';
import { NOT_COMPOSED } from './example-limits.const';
import type { NoticeLink } from './example-limits.types';
import { NotificationLimits } from './notification-limits';
import { ScreenLimits } from './screen-limits';

/**
 * CH-01 (D-UI-58): примеры экранов и уведомлений модулей сборки
 * представлений области — приложения UI или набора — укладываются в лимиты
 * мессенджера. Проверка единицы: примеры собирает тест (`ChatExamples`), а
 * `check` вызывает на каждой паре «сборка × возможности» и получает строки
 * `CH-01: …`. Число вариантов экрана — не нарушение, число ссылок
 * уведомления — нарушение. Дефект представления — строкой; примеры другого
 * набора и возможности не по схеме — бросок программисту.
 */
export class ExampleLimits {
  readonly id = 'CH-01';

  constructor(private readonly examples: ChatExamples) {}

  /** Нарушения сборки на возможностях: экраны, затем уведомления — в порядке примеров. */
  check(
    views: AppChatViews,
    capabilities: MessengerCapabilities,
  ): readonly string[] {
    this.verify(views, capabilities);
    const ids = new UiIds(views.set);
    const area =
      views.app === undefined
        ? `набор ${views.set.name}`
        : `приложение ${ids.app(views.app)}`;
    return [
      ...this.screens(ids, area, views, capabilities),
      ...this.notifications(ids, area, views, capabilities),
    ];
  }

  /** Примеры и сборка — одного набора, возможности — по схеме; иначе бросок без значений. */
  private verify(
    views: AppChatViews,
    capabilities: MessengerCapabilities,
  ): void {
    if (this.examples.set !== views.set) {
      throw new Error(
        `ExampleLimits: примеры набора ${this.examples.set.name}, а представления — ${views.scopeName()}`,
      );
    }
    if (!v.is(MessengerCapabilitiesSchema, capabilities)) {
      throw new Error('ExampleLimits: возможности мессенджера не по схеме');
    }
  }

  /** Строки примеров экранов модулей сборки. */
  private screens(
    ids: UiIds,
    area: string,
    views: AppChatViews,
    capabilities: MessengerCapabilities,
  ): string[] {
    const measured = new Set(
      views
        .registries()
        .flatMap(({ module }) => module.screens.map((def) => ids.screen(def))),
    );
    const limits = new ScreenLimits(views, capabilities);
    return this.examples
      .screens()
      .filter(({ id }) => measured.has(id))
      .flatMap(({ id, name, view }) =>
        ExampleLimits.lines(
          `${area}: экран ${id}, пример ${name}`,
          () => limits.compose(view),
          (messages) => limits.check(messages),
        ),
      );
  }

  /** Строки примеров уведомлений модулей сборки; ссылки — из Def. */
  private notifications(
    ids: UiIds,
    area: string,
    views: AppChatViews,
    capabilities: MessengerCapabilities,
  ): string[] {
    const measured = new Map(
      views
        .registries()
        .flatMap(({ module }) =>
          module.notifications.map((def): [string, AnyNotificationDef] => [
            ids.notification(def),
            def,
          ]),
        ),
    );
    const limits = new NotificationLimits(capabilities);
    return this.examples.notifications().flatMap(({ id, name, data }) => {
      const def = measured.get(id);
      if (def === undefined) return [];
      const presenter = views.notification(id);
      const links = ExampleLimits.links(ids, def);
      return ExampleLimits.lines(
        `${area}: уведомление ${id}, пример ${name}`,
        () => presenter.text(data),
        (text) => limits.check(text, links),
      );
    });
  }

  /** Ссылки уведомления из Def с подписью экрана-цели — как её ставит беседа. */
  private static links(ids: UiIds, def: AnyNotificationDef): NoticeLink[] {
    return def
      .links()
      .map((screen) => ({ screen: ids.screen(screen), label: screen.label }));
  }

  /**
   * Строки примера с местом и префиксом `CH-01: `. В `try` — только вызов
   * представления: его бросок — одна строка без текста броска; мера идёт вне
   * `try`.
   */
  private static lines<T>(
    place: string,
    show: () => T,
    measure: (shown: T) => readonly string[],
  ): string[] {
    let shown: T;
    try {
      shown = show();
    } catch {
      return [`CH-01: ${place}: ${NOT_COMPOSED}`];
    }
    return measure(shown).map((problem) => `CH-01: ${place}: ${problem}`);
  }
}
