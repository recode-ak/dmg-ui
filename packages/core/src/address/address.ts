import type { AnyScreenDef, ParamsOf } from '../manifest/screen-def.types';

/**
 * Адрес экрана: ссылка на Def и параметры экземпляра (выход схемы
 * `params`). Строится `ScreenDef.at`, переносится `AddressCodec`.
 */
export class Address<D extends AnyScreenDef = AnyScreenDef> {
  readonly screen: D;
  readonly params: ParamsOf<D>;

  constructor(screen: D, params: ParamsOf<D>) {
    this.screen = screen;
    this.params = params;
  }
}
