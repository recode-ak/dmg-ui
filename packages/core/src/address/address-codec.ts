import { err, ok, type Result } from 'dmg-core';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { SchemaCheck } from '../schema/schema-check';
import { Address } from './address';
import type { AddressJson, AddressRejection } from './address-codec.types';
import { UiIds } from './ui-ids';

export type { AddressJson, AddressRejection } from './address-codec.types';

/**
 * Перенос адреса через JSON в пределах набора UI. `encode` — свой адрес,
 * ошибка в нём — бросок; `decode` — внешние данные, отказ — `Result`.
 */
export class AddressCodec {
  private readonly ids: UiIds;

  constructor(set: AnyUiSetDef) {
    this.ids = new UiIds(set);
  }

  /** Адрес в JSON; экран вне набора — бросок. */
  encode(address: Address): AddressJson {
    return { screen: this.ids.screen(address.screen), params: address.params };
  }

  /** Адрес из JSON: экран по `id`, параметры — по схеме экрана. */
  decode(json: unknown): Result<Address, AddressRejection> {
    if (typeof json !== 'object' || json === null || !('screen' in json)) {
      return err({ reason: 'malformed' });
    }
    const { screen } = json;
    if (typeof screen !== 'string') return err({ reason: 'malformed' });
    const def = this.ids.findScreen(screen);
    if (def === undefined) return err({ reason: 'unknownScreen', screen });
    const params = 'params' in json ? json.params : undefined;
    const parsed = new SchemaCheck(def.params).run(params);
    if (!parsed.ok) {
      return err({ reason: 'invalidParams', screen, issues: parsed.error });
    }
    return ok(new Address(def, parsed.value));
  }
}
