import type { PageConfirm, PageViewStatus } from 'dmg-ui/web-ui';

/** Пометка области: короткий текст («Загрузка…», «Нет связи — переподключаемся»). */
export type RegionMark = string;

/** Действие без полей — кнопка; недоступное остаётся в списке с `enabled: false`. */
export type ActionModel = {
  readonly name: string;
  readonly label: string;
  readonly enabled: boolean;
  /** Причина отключения из вида; ключа нет у доступного и у приглушённого без причины. */
  readonly reason?: string;
};

/** Границы числового поля: `step` — 1 у целого, иначе `'any'`. */
export type FieldBounds = {
  readonly min?: number;
  readonly max?: number;
  readonly step: number | 'any';
};

/** Чекбокс булева поля: что отправлять при отметке и без неё. */
export type CheckboxModel = {
  readonly on: string;
  readonly off: string;
  readonly checked: boolean;
};

/**
 * Поле формы. `choice` — выбор по подписям (значение формы — подпись),
 * `person` — выбор из людей примера (значение — `uuid`), `text` — строка,
 * `number` и `date` — числовой и календарный ввод, `checkbox` — булево.
 */
export type FieldModel = {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly optional: boolean;
  readonly choices?: readonly string[];
  readonly widget:
    | 'text'
    | 'choice'
    | 'person'
    | 'number'
    | 'date'
    | 'checkbox';
  /** Подсказка, пример и пределы одной строкой. */
  readonly help?: string;
  readonly bounds?: FieldBounds;
  readonly checkbox?: CheckboxModel;
  readonly issues: readonly string[];
};

/** Форма действия: поля, замечания к форме и признак основной. */
export type FormModel = {
  readonly kind: 'action' | 'local';
  readonly name: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason?: string;
  readonly primary: boolean;
  readonly fields: readonly FieldModel[];
  readonly issues: readonly string[];
};

/** Строка задачи: что с ней можно сделать — решает модель, не DOM. */
export type TaskRowModel = {
  readonly uuid: string;
  readonly title: string;
  readonly done: boolean;
  readonly selected: boolean;
  readonly selectable: boolean;
  readonly openable: boolean;
};

/** Действия и формы экрана — из модели формы пакета, без жестов примера. */
export type ScreenControls = {
  readonly actions: readonly ActionModel[];
  readonly forms: readonly FormModel[];
};

/** Тело «Мои задачи». */
export type ListBody = ScreenControls & {
  readonly kind: 'list';
  readonly rows: readonly TaskRowModel[];
  readonly empty?: string;
};

/** Тело «Задача»: зона «Выполнено» ждёт или приняла задачу. */
export type CardBody = ScreenControls & {
  readonly kind: 'card';
  readonly uuid: string;
  readonly title: string;
  readonly done: boolean;
  readonly draggable: boolean;
  readonly zone: 'waiting' | 'accepted';
  readonly dropEnabled: boolean;
};

/** Тело «Назначенные мне»: строки с галочкой у открытых и действия экрана. */
export type AssignedBody = {
  readonly kind: 'assigned';
  readonly rows: readonly TaskRowModel[];
  readonly empty?: string;
  readonly actions: readonly ActionModel[];
};

/** Тело «Пользователь»: учётная запись и текст её активности, без управления. */
export type UserBody = {
  readonly kind: 'user';
  readonly userId: string;
  readonly status: string;
};

/** Тело «Начать работу»: кнопки переходов меню. */
export type MenuBody = ScreenControls & {
  readonly kind: 'menu';
};

/** Тело экрана по виду. */
export type ScreenBody =
  | ListBody
  | CardBody
  | AssignedBody
  | UserBody
  | MenuBody;

/**
 * Модель области — то, что видит человек; данные JSON. `busy` — область
 * приглушена, всё управление отключено.
 */
export type RegionModel = {
  readonly status: PageViewStatus;
  readonly screen?: string;
  readonly title: string;
  readonly marks: readonly RegionMark[];
  readonly busy: boolean;
  readonly note?: string;
  readonly issues: readonly string[];
  readonly confirm?: PageConfirm;
  readonly retry: boolean;
  readonly refusal?: string;
  readonly revision?: number;
  readonly body?: ScreenBody;
};
