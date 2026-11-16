import { type AnyErrorDef, Def, type DefSchemas, toJsonSchema } from 'dmg-core';
import * as v from 'valibot';
import { Address } from '../address/address';
import { RefreshOn } from './refresh-on';
import { ScreenAction } from './screen-action';
import type {
  NormalizedScreen,
  ParamsSchemaOf,
  ScreenActions,
  ScreenExampleSpec,
  ScreenExits,
  ScreenLocals,
  ScreenSpec,
  StateSchemaOf,
} from './screen-def.types';
import { ScreenExit } from './screen-exit';
import { ScreenLocal } from './screen-local';

export type {
  ActionSpec,
  AnyScreenDef,
  DataOf,
  EmptyParams,
  ExitSpec,
  InputSchema,
  InputSchemaOf,
  ItemTexts,
  LocalSpec,
  NormalizedAction,
  NormalizedExit,
  NormalizedLocal,
  NormalizedRefresh,
  NormalizedScreen,
  ParamsOf,
  ParamsSchemaOf,
  RefreshSpec,
  ScreenActions,
  ScreenExampleSpec,
  ScreenExits,
  ScreenLocals,
  ScreenSpec,
  StateOf,
  StateSchemaOf,
  StrictSchema,
} from './screen-def.types';

/**
 * Манифест экрана: параметры адреса, загрузка, состояние, действия, выходы
 * и перечитывание. Статичен и читается без кода экрана (ФР-4); код —
 * наследник `ScreenCode`. Генерик по спеке, как `UseCaseDef`.
 */
export class ScreenDef<const S extends ScreenSpec = ScreenSpec> extends Def<
  S['name']
> {
  readonly dmg = 'screen';
  readonly params: ParamsSchemaOf<S>;
  readonly reads: S['reads'];
  readonly data: S['data'];
  readonly state: StateSchemaOf<S>;
  readonly actions: ScreenActions<S>;
  readonly locals: ScreenLocals<S>;
  readonly primary: string | undefined;
  readonly exits: ScreenExits<S>;
  readonly refresh: readonly RefreshOn[];
  readonly catches: readonly AnyErrorDef[];
  readonly examples: Readonly<Record<string, ScreenExampleSpec>>;

  constructor(spec: S) {
    super(spec);
    // Ветки условных `ParamsSchemaOf`/`StateSchemaOf` выбирает наличие ключа
    // в спеке — ровно то, что проверяет `??`; TS этой связи не видит.
    this.params = (spec.params ?? v.strictObject({})) as ParamsSchemaOf<S>;
    this.reads = spec.reads;
    this.data = spec.data;
    this.state = spec.state as StateSchemaOf<S>;
    this.actions = ScreenDef.group(
      spec.actions,
      (name, a) => new ScreenAction(name, a),
    ) as ScreenActions<S>;
    this.locals = ScreenDef.group(
      spec.locals,
      (name, l) => new ScreenLocal(name, l),
    ) as ScreenLocals<S>;
    this.primary = spec.primary;
    this.exits = ScreenDef.group(
      spec.exits,
      (name, e) => new ScreenExit(this, name, e),
    ) as ScreenExits<S>;
    this.refresh = (spec.refresh ?? []).map((r) => new RefreshOn(r));
    this.catches = spec.catches ?? [];
    this.examples = spec.examples ?? {};
  }

  static define<const S extends ScreenSpec>(spec: S): ScreenDef<S> {
    return new ScreenDef<S>(spec);
  }

  /**
   * Группа элементов экрана с именами из ключей спеки, как у
   * `EventDef.define`. Ключи и типы группы задаёт поле класса: сборка через
   * `Object.entries` в mapped type не выражается без утверждения.
   */
  private static group<T, R>(
    specs: Readonly<Record<string, T>> | undefined,
    make: (name: string, spec: T) => R,
  ): Readonly<Record<string, R>> {
    const out: Record<string, R> = {};
    for (const [name, spec] of Object.entries(specs ?? {})) {
      out[name] = make(name, spec);
    }
    return out;
  }

  /**
   * Адрес экземпляра экрана. Параметры не по схеме — ошибка программиста,
   * бросок (Т-14); отказ на внешние данные даёт `AddressCodec.decode`.
   */
  at(params: v.InferInput<ParamsSchemaOf<S>>): Address<this> {
    const parsed = v.safeParse(this.params, params);
    if (!parsed.success) {
      throw new Error(
        `Экран ${this.name}: параметры адреса не по схеме — ${v.summarize(parsed.issues)}`,
      );
    }
    return new Address(this, parsed.output);
  }

  override schemas(): DefSchemas {
    const out: (readonly [string, v.GenericSchema])[] = [
      ['params', this.params],
      ['data', this.data],
    ];
    if (this.state !== undefined) out.push(['state', this.state]);
    for (const a of Object.values<ScreenAction>(this.actions)) {
      if (a.input !== undefined) out.push([`action.${a.name}.input`, a.input]);
    }
    for (const l of Object.values<ScreenLocal>(this.locals)) {
      if (l.input !== undefined) out.push([`local.${l.name}.input`, l.input]);
    }
    for (const e of Object.values<ScreenExit>(this.exits)) {
      if (e.data !== undefined) out.push([`exit.${e.name}.data`, e.data]);
    }
    return out;
  }

  normalize(): NormalizedScreen {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      params: toJsonSchema(this.params),
      reads: this.reads.map((uc) => uc.name),
      data: toJsonSchema(this.data),
      state: this.state === undefined ? undefined : toJsonSchema(this.state),
      actions: Object.values<ScreenAction>(this.actions).map((a) =>
        a.normalize(),
      ),
      locals: Object.values<ScreenLocal>(this.locals).map((l) => l.normalize()),
      primary: this.primary,
      exits: Object.values<ScreenExit>(this.exits).map((e) => e.normalize()),
      refresh: this.refresh.map((r) => r.normalize()),
      catches: this.catches.map((e) => e.code),
      examples: Object.keys(this.examples),
    };
  }
}
