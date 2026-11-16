import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';
import type { FieldChoices, FieldValues, LocalFns } from './screen-code.types';

export type {
  Choice,
  FieldChoices,
  FieldValues,
  InputOf,
  LocalFn,
  LocalFns,
} from './screen-code.types';

/**
 * Код экрана — чистая часть (Ф2): начальное состояние, доступность
 * действий, варианты и начальные значения полей, функции локальных
 * действий. Живёт отдельно от манифеста и грузится лениво; вызывающего
 * не видит (ФР-4). Загрузку и обработчики действий добавляет Ф4.
 *
 * Методы необязательны: умолчание применяет `ScreenLogic` — действие
 * доступно, вариантов и начальных значений нет. Наследник переопределяет
 * только нужное.
 */
export abstract class ScreenCode<D extends AnyScreenDef> {
  /**
   * Функции локальных действий по именам манифеста. Экран без `locals` их
   * не задаёт; нет функции у объявленного действия — бросок в `ScreenLogic`.
   */
  readonly locals: Partial<LocalFns<D>> = {};

  /**
   * Начальное состояние по данным загрузки. Экран без `state` его не
   * определяет; у экрана со `state` без него `ScreenLogic` бросает с именем
   * экрана.
   */
  initialState?(data: DataOf<D>): StateOf<D>;

  /** Доступно ли действие или локальное действие сейчас; без метода — да. */
  available?(name: string, data: DataOf<D>, state: StateOf<D>): boolean;

  /** Варианты полей входа действия по данным; без метода — вариантов нет. */
  choices?(name: string, data: DataOf<D>, state: StateOf<D>): FieldChoices;

  /** Начальные значения полей входа действия по данным; без метода — нет. */
  defaults?(name: string, data: DataOf<D>, state: StateOf<D>): FieldValues;
}
