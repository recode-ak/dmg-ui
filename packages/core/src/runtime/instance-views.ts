import type { AddressJson } from '../address/address-codec.types';
import type { RenderContext } from './context.types';
import type { InstanceView } from './outcome.types';
import type { InstanceLoad } from './screen-instance.types';
import type { AnyScreenUnit, ScreenFrame } from './screen-unit.types';

/**
 * Сборка вида экземпляра экрана — одно место для экземпляра и
 * `ScreenPreview`: шапка (экран, адрес, контекст, основное действие) и
 * загруженное — данные, состояние, действия или отказ.
 */
export class InstanceViews {
  private readonly unit: AnyScreenUnit;
  private readonly screen: string;
  private readonly address: AddressJson;
  private readonly context: RenderContext;

  constructor(
    unit: AnyScreenUnit,
    screen: string,
    address: AddressJson,
    context: RenderContext,
  ) {
    this.unit = unit;
    this.screen = screen;
    this.address = address;
    this.context = context;
  }

  /** Загруженное по кадру: действия — кодом экрана; бросок кода — наружу. */
  ready(frame: ScreenFrame): InstanceLoad {
    return {
      status: 'ready',
      data: frame.data,
      state: frame.state,
      presentation: this.unit.present(frame, this.context.readOnly),
    };
  }

  /** Вид при ревизии; у отказа нет данных и действий. */
  view(revision: number, loaded: InstanceLoad): InstanceView {
    const { primary } = this.unit.def;
    const base = {
      screen: this.screen,
      address: this.address,
      revision,
      context: this.context,
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
}
