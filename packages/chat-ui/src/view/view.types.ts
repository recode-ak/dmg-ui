import type {
  AnyNotificationDef,
  AnyScreenDef,
  Choice,
  InstanceView,
  NotificationDataOf,
  ScreenViewOf,
} from 'dmg-ui';
import type { Accent, FormattedText } from '../message/message.types';
import type { ViewKit } from './view-kit';

// Вывод представления беседы (D-UI-50): сообщения с вариантами-намерениями
// без ссылок — ссылки ставит беседа; формы представлений экрана и
// уведомления.

/** Вариант представления — намерение без ссылки; ссылку ставит беседа. */
export type ViewOption =
  | {
      readonly kind: 'action';
      readonly name: string;
      readonly label: string;
      readonly accent?: Accent;
    }
  | {
      readonly kind: 'local';
      readonly name: string;
      readonly label: string;
      readonly accent?: Accent;
    }
  /**
   * Строка действия строки (D-UI-129): нажатие исполняет действие `name` со
   * входом из ключа строки `value`; на экране уникальна парой имени и
   * значения, подпись — из строки.
   */
  | {
      readonly kind: 'row';
      readonly name: string;
      readonly value: Choice['value'];
      readonly label: string;
    }
  /**
   * Отключённое действие или локальное действие (D-UI-105): имя уникально на
   * экране, подпись уже с пометкой; причины нет — её отвечает беседа на
   * нажатие по живому виду.
   */
  | {
      readonly kind: 'disabled';
      readonly name: string;
      readonly label: string;
    }
  | { readonly kind: 'back'; readonly label: string }
  | { readonly kind: 'retry'; readonly label: string }
  | { readonly kind: 'home'; readonly label: string };

/** Сообщение представления: текст и варианты-намерения; вид — как у `Message`. */
export type ViewMessage = {
  readonly kind: 'text';
  readonly text: FormattedText;
  readonly options: readonly ViewOption[];
};

/** Вывод представления экрана: одно сообщение или несколько; варианты — только у последнего. */
export type ViewOutput = ViewMessage | readonly ViewMessage[];

/** Полное представление экрана: вид в типах экрана и набор показа. */
export type ScreenRender<D extends AnyScreenDef> = (
  view: ScreenViewOf<D>,
  kit: ViewKit,
) => ViewOutput;

/** Текст тела по виду — короткая форма: одно сообщение с вариантами по умолчанию. */
export type ScreenText<D extends AnyScreenDef> = (
  view: ScreenViewOf<D>,
) => string;

/** След в истории: ключ — адрес экрана или значение из вида (шаг урока). */
export type HistoryKey<D extends AnyScreenDef> =
  | 'address'
  | ((view: ScreenViewOf<D>) => string);

/** Полная форма представления экрана: вывод, свои тексты отказов, след в истории. */
export type ScreenPresenterSpec<D extends AnyScreenDef> = {
  readonly render: ScreenRender<D>;
  /** Свои тексты отказов по коду из `catches`. */
  readonly caught?: CaughtTexts;
  /** Есть — экран остаётся в беседе следом в истории. */
  readonly history?: HistoryKey<D>;
};

/** Текст уведомления по его данным. */
export type NotificationRender<D extends AnyNotificationDef> = (
  data: NotificationDataOf<D>,
) => string;

/** Свои тексты отказов экрана по коду ошибки из `catches`. */
export type CaughtTexts = Readonly<Record<string, string>>;

/** Представление экрана без генерика — так его хранит реестр. */
export type AnyScreenPresenter = {
  readonly def: AnyScreenDef;
  render(view: InstanceView, kit: ViewKit): ViewOutput;
  caught(code: string): string | undefined;
  /** Ключ истории вида; экран без следа — `undefined`. */
  history(view: InstanceView): string | undefined;
};

/** Представление уведомления без генерика — так его хранит реестр. */
export type AnyNotificationPresenter = {
  readonly def: AnyNotificationDef;
  text(data: unknown): string;
};
