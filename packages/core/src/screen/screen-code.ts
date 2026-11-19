import type { DomainError, Result } from 'dmg-core';
import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';
import type {
  ActionSteps,
  AvailabilityFns,
  FieldChoices,
  FieldValues,
  LoadContext,
  LocalFns,
} from './screen-code.types';

export type {
  ActionStep,
  ActionSteps,
  AvailabilityContext,
  AvailabilityFn,
  AvailabilityFns,
  Choice,
  FieldChoices,
  FieldValues,
  InputOf,
  LoadContext,
  LocalFn,
  LocalFns,
  ReadPort,
  StepContext,
  UcInputFor,
  UcOutputFor,
} from './screen-code.types';

/**
 * Код экрана: загрузка, шаги действий и чистая часть — начальное состояние,
 * доступность, варианты и начальные значения полей, локальные действия.
 * Живёт отдельно от манифеста и вызывающего не видит; субъект (`S` — тип
 * субъекта проекта) получает в контексте загрузки, шагов и доступности
 * (D-UI-98). `load` и `done` каждого действия обязательны (сверяет
 * `ScreenUnit`), умолчания остального применяет `ScreenLogic`.
 */
export abstract class ScreenCode<D extends AnyScreenDef, S = unknown> {
  /**
   * Функции локальных действий по именам манифеста. Экран без `locals` их
   * не задаёт; нет функции у объявленного действия — бросок в `ScreenLogic`.
   */
  readonly locals: Partial<LocalFns<D>> = {};

  /** Шаги действий по именам манифеста; у каждого действия нужен `done`. */
  readonly actions: Partial<ActionSteps<D, S>> = {};

  /**
   * Доступность действий и локальных действий по именам манифеста: ответ
   * «доступно, скрыто, отключено с причиной» (`Availability`). Нет записи —
   * доступно.
   */
  readonly availability: Partial<AvailabilityFns<D, S>> = {};

  /** Данные экрана через объявленные `reads`; отказ UC — `err`. */
  load?(ctx: LoadContext<D, S>): Promise<Result<DataOf<D>, DomainError>>;

  /**
   * Начальное состояние по данным загрузки. Экран без `state` его не
   * определяет; у экрана со `state` без него `ScreenLogic` бросает с именем
   * экрана.
   */
  initialState?(data: DataOf<D>): StateOf<D>;

  /** Варианты полей входа действия по данным; без метода — вариантов нет. */
  choices?(name: string, data: DataOf<D>, state: StateOf<D>): FieldChoices;

  /** Начальные значения полей входа действия по данным; без метода — нет. */
  defaults?(name: string, data: DataOf<D>, state: StateOf<D>): FieldValues;
}
