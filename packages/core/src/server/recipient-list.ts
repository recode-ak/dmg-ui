import {
  type AnyModuleDef,
  type DomainError,
  type Identified,
  ok,
  type Result,
  SystemCaller,
} from 'dmg-core';
import type { Trace } from 'dmg-core/app';
import { DefIndex } from 'dmg-core/graph';
import { UiIds } from '../address/ui-ids';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import { jsonRecord } from './json-record';
import type { RecipientListSpec } from './recipient-list.types';

export type { RecipientListSpec } from './recipient-list.types';

/**
 * Получатели уведомления по событию: `uuid` из полей payload или из полей
 * выхода query UC (объект или элементы массива). UC вызывает система от
 * имени приложения UI; UC вне приложения — бросок в конструкторе.
 */
export class RecipientList<U extends Identified> {
  private readonly spec: RecipientListSpec<U>;
  private readonly ids: UiIds;
  private readonly modules = new Map<AnyNotificationDef, AnyModuleDef>();

  constructor(spec: RecipientListSpec<U>) {
    this.spec = spec;
    this.ids = new UiIds(spec.set);
    const index = DefIndex.from(spec.set.app.modules);
    for (const module of spec.set.modules) {
      for (const def of module.notifications ?? []) {
        if (def.recipients.from !== 'query') continue;
        const owner = index.moduleOf(def.recipients.uc);
        if (owner === undefined) {
          throw new Error(
            `RecipientList: UC получателей ${def.recipients.uc.name} уведомления ${def.name} вне приложения`,
          );
        }
        this.modules.set(def, owner);
      }
    }
  }

  /** `uuid` получателей без повторов; отказ UC получателей — `err`. */
  async of(
    def: AnyNotificationDef,
    payload: unknown,
    trace: Trace,
  ): Promise<Result<readonly string[], DomainError>> {
    const fields = jsonRecord(payload);
    const { recipients } = def;
    if (recipients.from === 'payload') {
      return ok(RecipientList.uuids([fields], recipients.fields));
    }
    const module = this.modules.get(def);
    if (module === undefined) {
      throw new Error(`RecipientList: уведомление ${def.name} вне набора`);
    }
    const input = Object.fromEntries(
      Object.entries(recipients.input).map(([key, field]) => [
        key,
        fields[field],
      ]),
    );
    const caller = new SystemCaller<U>({
      kind: 'app',
      module: this.spec.set.name,
      name: this.ids.notification(def),
    });
    const wire = await this.spec.dispatch.dispatch({
      module,
      uc: recipients.uc,
      input,
      caller,
      trace,
    });
    const output = recipients.uc.restoreResult(wire);
    if (!output.ok) return output;
    const rows = Array.isArray(output.value) ? output.value : [output.value];
    return ok(RecipientList.uuids(rows.map(jsonRecord), recipients.fields));
  }

  private static uuids(
    rows: readonly Readonly<Record<string, unknown>>[],
    fields: readonly string[],
  ): string[] {
    const found = new Set<string>();
    for (const row of rows) {
      for (const field of fields) {
        const value = row[field];
        if (typeof value === 'string' && value !== '') found.add(value);
      }
    }
    return [...found];
  }
}
