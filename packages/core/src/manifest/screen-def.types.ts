import type {
  AnyErrorDef,
  AnyEventDef,
  AnyUseCaseDef,
  DefSpec,
  DefTexts,
} from 'dmg-core';
import type * as v from 'valibot';
import type { NormalizedSchema } from './normalized.types';
import type { ScreenAction } from './screen-action';
import type { ScreenDef } from './screen-def';
import type { ScreenExit } from './screen-exit';
import type { ScreenLocal } from './screen-local';

/**
 * Схема параметров адреса и состояния — объект без лишних ключей:
 * `v.object` отбросил бы лишнее молча.
 */
export type StrictSchema = v.StrictObjectSchema<
  v.ObjectEntries,
  v.ErrorMessage<v.StrictObjectIssue> | undefined
>;

/** Схема входа действия — объект полей. */
export type InputSchema =
  | v.ObjectSchema<v.ObjectEntries, v.ErrorMessage<v.ObjectIssue> | undefined>
  | StrictSchema;

/** Параметры экрана без поля `params` в спеке — пустой объект. */
export type EmptyParams = v.StrictObjectSchema<
  Record<string, never>,
  undefined
>;

/** Тексты элемента экрана; имя элемента — его ключ в спеке. */
export type ItemTexts = {
  readonly label: string;
  readonly description: string;
};

/**
 * Действие экрана. Без `uc` — действие-переход (меню, листание). `to` — thunk: взаимные
 * ссылки экранов иначе падают при импорте. Свой экран в `to` не
 * объявляется — переход на него разрешён неявно.
 */
export type ActionSpec = ItemTexts & {
  readonly visible?: boolean;
  readonly input?: InputSchema;
  /** Command UC действия; что он command — правило графа. */
  readonly uc?: AnyUseCaseDef;
  readonly to?: () => readonly AnyScreenDef[];
  /** Подтверждение; тексты статичны, данные рисует представление. */
  readonly confirm?: ItemTexts;
};

/** Локальное действие: меняет состояние экрана, UC не вызывает. */
export type LocalSpec = ItemTexts & {
  readonly input?: InputSchema;
};

/** Выход экрана; выходы объявляет экран, а не действие: любое действие вправе вернуть любой выход. */
export type ExitSpec = ItemTexts & {
  readonly data?: v.GenericSchema;
};

/**
 * Событие перечитывания: `params` — параметр экземпляра → поле
 * payload, `subject` — поле payload с `uuid` субъекта, `any` — явное
 * «всем». Ключи — строки, их сверяют правила формы манифеста в графе.
 */
export type RefreshSpec = {
  readonly event: AnyEventDef;
  readonly params?: Readonly<Record<string, string>>;
  readonly subject?: string;
  readonly any?: true;
};

/** Пример экрана; соответствие схемам проверяет правило графа, а не конструктор. */
export type ScreenExampleSpec = ItemTexts & {
  readonly params: unknown;
  readonly data: unknown;
  readonly state?: unknown;
};

/** Спека экрана. Без `params` — пустой объект, без `state` — состояния нет. */
export type ScreenSpec = DefSpec & {
  readonly params?: StrictSchema;
  /** Query UC загрузки; что они query — правило графа. */
  readonly reads: readonly AnyUseCaseDef[];
  readonly data: v.GenericSchema;
  readonly state?: StrictSchema;
  readonly actions?: Readonly<Record<string, ActionSpec>>;
  readonly locals?: Readonly<Record<string, LocalSpec>>;
  /** Имя основного действия; что оно есть в `actions` — правило графа. */
  readonly primary?: string;
  readonly exits?: Readonly<Record<string, ExitSpec>>;
  readonly refresh?: readonly RefreshSpec[];
  /** Коды отказа, у которых на экране свой ответ; объявляются на экране, а не на действии. */
  readonly catches?: readonly AnyErrorDef[];
  readonly examples?: Readonly<Record<string, ScreenExampleSpec>>;
};

/** Схема параметров по спеке: объявленная или пустой объект. */
export type ParamsSchemaOf<S extends ScreenSpec> = S extends {
  readonly params: infer P extends StrictSchema;
}
  ? P
  : EmptyParams;

/** Схема состояния по спеке; без `state` — `undefined`. */
export type StateSchemaOf<S extends ScreenSpec> = S extends {
  readonly state: infer P extends StrictSchema;
}
  ? P
  : undefined;

/** Схема входа действия или локального действия по его спеке. */
export type InputSchemaOf<A extends LocalSpec> = A extends {
  readonly input: infer I extends InputSchema;
}
  ? I
  : undefined;

/** Действия экрана по ключам спеки. */
export type ScreenActions<S extends ScreenSpec> = {
  readonly [K in keyof NonNullable<S['actions']>]: ScreenAction<
    InputSchemaOf<NonNullable<S['actions']>[K]>
  >;
};

/** Локальные действия экрана по ключам спеки. */
export type ScreenLocals<S extends ScreenSpec> = {
  readonly [K in keyof NonNullable<S['locals']>]: ScreenLocal<
    InputSchemaOf<NonNullable<S['locals']>[K]>
  >;
};

/** Выходы экрана по ключам спеки. */
export type ScreenExits<S extends ScreenSpec> = {
  readonly [K in keyof NonNullable<S['exits']>]: ScreenExit;
};

/**
 * Любой Def экрана — структурно, по публичным членам. Без `at`: метод с
 * типом входа ломает вариантность (как `command` у `AnyUseCaseDef`).
 * Схемы, действия и локальные действия — общего вида: схемы valibot
 * инвариантны, конкретный экран иначе к нему не присваивается.
 */
export type AnyScreenDef = {
  readonly [K in Exclude<
    keyof ScreenDef,
    'at' | 'params' | 'state' | 'actions' | 'locals'
  >]: ScreenDef[K];
} & {
  readonly params: v.GenericSchema;
  readonly state: v.GenericSchema | undefined;
  readonly actions: Readonly<Record<string, ScreenAction>>;
  readonly locals: Readonly<Record<string, ScreenLocal>>;
};

/** Параметры адреса экрана — выход схемы `params`. */
export type ParamsOf<D extends AnyScreenDef> = v.InferOutput<D['params']>;

/** Данные загрузки экрана. */
export type DataOf<D extends AnyScreenDef> = v.InferOutput<D['data']>;

/** Состояние экрана; без схемы состояния — `undefined`. */
export type StateOf<D extends AnyScreenDef> = D['state'] extends v.GenericSchema
  ? v.InferOutput<D['state']>
  : undefined;

/** Сериализуемая форма действия; переходы — именами экранов. */
export type NormalizedAction = DefTexts & {
  readonly visible: boolean;
  readonly input: NormalizedSchema | undefined;
  readonly uc: string | undefined;
  readonly to: readonly string[];
  readonly confirm: ItemTexts | undefined;
};

/** Сериализуемая форма локального действия. */
export type NormalizedLocal = DefTexts & {
  readonly input: NormalizedSchema | undefined;
};

/** Сериализуемая форма выхода. */
export type NormalizedExit = DefTexts & {
  readonly data: NormalizedSchema | undefined;
};

/** Сериализуемая форма записи перечитывания; событие — именем. */
export type NormalizedRefresh = {
  readonly event: string;
  readonly params: Readonly<Record<string, string>>;
  readonly subject: string | undefined;
  readonly any: boolean;
};

/** Сериализуемая форма экрана: схемы — JSON Schema, ссылки — именами. */
export type NormalizedScreen = DefTexts & {
  readonly dmg: 'screen';
  readonly visible: boolean;
  readonly params: NormalizedSchema;
  readonly reads: readonly string[];
  readonly data: NormalizedSchema;
  readonly state: NormalizedSchema | undefined;
  readonly actions: readonly NormalizedAction[];
  readonly locals: readonly NormalizedLocal[];
  readonly primary: string | undefined;
  readonly exits: readonly NormalizedExit[];
  readonly refresh: readonly NormalizedRefresh[];
  /** Коды ошибок. */
  readonly catches: readonly string[];
  /** Имена примеров. */
  readonly examples: readonly string[];
};
