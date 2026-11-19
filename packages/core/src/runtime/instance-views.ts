import type { AddressJson } from '../address/address-codec.types';
import type { AppReach } from '../manifest/app-reach';
import type { RenderContext, ViewContext } from './context.types';
import type { InstanceView } from './outcome.types';
import type { InstanceLoad } from './screen-instance.types';
import type { AnyScreenUnit, ScreenFrame } from './screen-unit.types';

/**
 * Сборка вида экземпляра экрана (D-UI-98) — одно место для экземпляра и
 * `ScreenPreview`: шапка (экран, адрес, контекст, подсказка, основное действие) и
 * загруженное — данные, состояние, действия или отказ. Действия, отрезанные
 * составом приложения UI (`AppReach`) и скрытые кодом экрана, в вид не
 * попадают; субъекта в контексте вида нет.
 */
export class InstanceViews {
  private readonly unit: AnyScreenUnit;
  private readonly screen: string;
  private readonly address: AddressJson;
  private readonly context: RenderContext;
  private readonly reach: AppReach;

  constructor(
    unit: AnyScreenUnit,
    screen: string,
    address: AddressJson,
    context: RenderContext,
    reach: AppReach,
  ) {
    this.unit = unit;
    this.screen = screen;
    this.address = address;
    this.context = context;
    this.reach = reach;
  }

  /**
   * Загруженное по кадру: действия — кодом экрана, без отрезанных; бросок
   * кода — наружу.
   */
  ready(frame: ScreenFrame): InstanceLoad {
    const { unit, reach } = this;
    const presentation = unit.present(frame, this.context);
    const actions = presentation.actions.filter((view) => {
      const action = unit.action(view.name);
      return action === undefined || !reach.cuts(unit.def, action);
    });
    return {
      status: 'ready',
      data: frame.data,
      state: frame.state,
      presentation: { ...presentation, actions },
    };
  }

  /** Вид при ревизии; у отказа нет данных и действий. */
  view(revision: number, loaded: InstanceLoad): InstanceView {
    const primary = this.primary(loaded);
    const { hint } = this.unit.def;
    const base = {
      screen: this.screen,
      address: this.address,
      revision,
      context: this.viewContext(),
      ...(hint === undefined ? {} : { hint }),
      ...(primary === undefined ? {} : { primary }),
    };
    if (loaded.status === 'refused') {
      return {
        ...base,
        status: 'refused',
        refusal: loaded.refusal,
        actions: [],
        locals: [],
      };
    }
    const { data, state, presentation } = loaded;
    return {
      ...base,
      status: 'ready',
      data,
      ...(state === undefined ? {} : { state }),
      ...presentation,
    };
  }

  /**
   * Основное действие манифеста; отрезанное составом приложения — нет, у
   * загруженного — только если оно есть в действиях вида (скрытое — нет).
   */
  private primary(loaded: InstanceLoad): string | undefined {
    const { unit, reach } = this;
    const { primary } = unit.def;
    if (primary === undefined) return undefined;
    const action = unit.action(primary);
    if (action !== undefined && reach.cuts(unit.def, action)) return undefined;
    if (loaded.status === 'refused') return primary;
    return loaded.presentation.actions.some((view) => view.name === primary)
      ? primary
      : undefined;
  }

  /** Контекст вида — место и признаки; субъект остаётся у кода экрана. */
  private viewContext(): ViewContext {
    const { locale, timeZone, delegate, readOnly } = this.context;
    return { locale, timeZone, delegate, readOnly };
  }
}
