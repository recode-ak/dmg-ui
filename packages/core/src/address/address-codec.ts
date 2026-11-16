import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { Address } from './address';
import type {
  AddressJson,
  AddressRejection,
  FieldIssue,
} from './address-codec.types';
import { UiIds } from './ui-ids';

export type {
  AddressJson,
  AddressRejection,
  FieldIssue,
} from './address-codec.types';

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
    const parsed = v.safeParse(def.params, params);
    if (!parsed.success) {
      return err({
        reason: 'invalidParams',
        screen,
        issues: parsed.issues.map((issue) => this.issueOf(issue)),
      });
    }
    return ok(new Address(def, parsed.output));
  }

  private issueOf(issue: v.BaseIssue<unknown>): FieldIssue {
    const key = issue.path?.[0]?.key;
    return key === undefined
      ? { text: issue.message }
      : { field: String(key), text: issue.message };
  }
}
