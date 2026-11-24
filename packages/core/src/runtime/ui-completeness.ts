import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { RegistryScope } from './module-registries.types';

/** Ключ записи реестра: Def экрана или уведомления. */
type Keyed = { readonly name: string };

/**
 * UI-06: у каждого экрана и уведомления модуля — ровно одна запись реестра
 * (код или представление канала), у каждого модуля области сборки — ровно
 * один реестр. Одна проверка для реестров модуля и сборок; нарушения — одной
 * ошибкой, по строке на каждое: нет → вне → два.
 */
export class UiCompleteness {
  readonly id = 'UI-06';

  /**
   * @param registry имя реестра в отказе (`CodeLoaders` и реестры
   *   представлений каналов);
   * @param entry слово записи в родительном падеже («загрузчика»).
   */
  constructor(
    private readonly registry: string,
    private readonly entry: string,
  ) {}

  /** Точное покрытие модуля: нет записи, запись вне модуля, две на Def. */
  module(module: AnyUiModuleDef, defs: readonly Keyed[]): void {
    this.fail(this.moduleLines(module, defs, true));
  }

  /** Часть модуля (слой перекрытия): без записей вне модуля и двойных. */
  part(module: AnyUiModuleDef, defs: readonly Keyed[]): void {
    this.fail(this.moduleLines(module, defs, false));
  }

  /**
   * Сборка области: у модуля области (`required`) нет реестра, реестр
   * модуля вне области, два реестра одного модуля.
   */
  scope(
    scope: RegistryScope,
    required: readonly AnyUiModuleDef[],
    given: readonly AnyUiModuleDef[],
  ): void {
    const head =
      scope.dmg === 'uiApp'
        ? `${this.registry} приложения ${scope.name}`
        : `${this.registry} набора ${scope.name}`;
    const outside = scope.dmg === 'uiApp' ? 'вне приложения' : 'вне набора';
    const lines = [
      ...required
        .filter((module) => !given.includes(module))
        .map((module) => `нет реестра модуля ${module.name}`),
      ...this.unique(given)
        .filter((module) => !required.includes(module))
        .map((module) => `реестр модуля ${module.name} ${outside}`),
      ...this.doubled(given).map(
        (module) => `два реестра модуля ${module.name}`,
      ),
    ];
    this.fail(lines.map((line) => `${head}: ${line}`));
  }

  private moduleLines(
    module: AnyUiModuleDef,
    defs: readonly Keyed[],
    exact: boolean,
  ): readonly string[] {
    const own: readonly Keyed[] = [...module.screens, ...module.notifications];
    const missing = exact ? own.filter((def) => !defs.includes(def)) : [];
    const outside = this.unique(defs).filter((def) => !own.includes(def));
    const lines = [
      ...(missing.length > 0
        ? [`нет ${this.entry} для ${this.names(missing)}`]
        : []),
      ...(outside.length > 0 ? [`${this.names(outside)} вне модуля`] : []),
      ...this.doubled(defs).map((def) => `два для ${def.name}`),
    ];
    const head = `${this.registry} модуля ${module.name}`;
    return lines.map((line) => `${head}: ${line}`);
  }

  private unique<T>(items: readonly T[]): readonly T[] {
    return [...new Set(items)];
  }

  private doubled<T>(items: readonly T[]): readonly T[] {
    return this.unique(
      items.filter((item, index) => items.indexOf(item) !== index),
    );
  }

  private names(defs: readonly Keyed[]): string {
    return defs.map((def) => def.name).join(', ');
  }

  private fail(lines: readonly string[]): void {
    if (lines.length === 0) return;
    throw new Error(lines.map((line) => `${this.id}: ${line}`).join('\n'));
  }
}
