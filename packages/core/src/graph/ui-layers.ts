import type { LayerAccess, SourceLayer } from 'dmg-core/graph';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UiChannelSpec } from './ui-graph-provider.types';

/** Платформа приложения видна всему фронту; модуль домена — только через вход. */
const PLATFORM: readonly LayerAccess[] = [
  { layer: 'kernel' },
  { layer: 'domain', entries: ['public'] },
];

/** Оболочка собирает фронт: общее берёт целиком. */
const SHELL: readonly LayerAccess[] = [{ layer: 'runner' }];

/**
 * Код и каналы модуля оболочка берёт только через `index.ts`: `public.ts` —
 * вход для соседних модулей канала, а не для сборки.
 */
const SHELL_ENTRY: readonly LayerAccess[] = [
  { layer: 'runner', entries: ['index'], rule: 'UI-34' },
];

/** Канал с этим именем дал бы слой `fe-<имя>`, совпавший с общим фронта или кодом модуля. */
const TAKEN_CHANNELS: readonly string[] = ['app', 'logic'];

/**
 * Слои фронта поставщика `dmg-ui`: описание `ui`, общее `fe-app`, код модуля
 * `fe-logic`, по каналу проекта — канал модуля `fe-<канал>` и общее канала
 * `<канал>-kit`. Каталоги задаёт проект (`ArchApp.layers`), здесь — только
 * видимость. Имена, при которых каталог модуля или слой канала совпал бы с
 * другим слоем, — отказ в конструкторе: иначе `arch:check` сообщил бы о
 * совпавших каталогах, не назвав причину.
 * @see ./ui-layers.test.ts
 */
export class UiLayers {
  /**
   * Без повторов: повтор модуля в наборе — `GraphError` при сборке графа
   * («граф не собран»), а не отказ проверки слоёв.
   */
  private readonly modules: readonly string[];
  private readonly channels: readonly UiChannelSpec[];

  constructor(set: AnyUiSetDef, channels: readonly UiChannelSpec[]) {
    this.modules = [...new Set(set.modules.map((m) => m.name))];
    this.channels = channels;
    this.verifyChannels();
    this.verifyModules();
  }

  list(): readonly SourceLayer[] {
    return [
      this.ui(),
      this.app(),
      this.logic(),
      ...this.channels.flatMap((c) => [this.channel(c), this.kit(c)]),
    ];
  }

  private ui(): SourceLayer {
    return {
      name: 'ui',
      axis: 'platform',
      rule: 'UI-28',
      sees: PLATFORM,
      seenBy: SHELL,
    };
  }

  private app(): SourceLayer {
    return {
      name: 'fe-app',
      axis: 'implementation',
      rule: 'UI-29',
      sees: [...PLATFORM, { layer: 'ui' }],
      seenBy: SHELL,
    };
  }

  private logic(): SourceLayer {
    return {
      name: 'fe-logic',
      axis: 'implementation',
      perModule: this.modules,
      rule: 'UI-30',
      sees: [...PLATFORM, { layer: 'ui' }, { layer: 'fe-app' }],
      seenBy: SHELL_ENTRY,
    };
  }

  /**
   * База видна только прямая: цепочка баз не транзитивна. Чужой модуль своего
   * канала — через `public.ts`, и только это нарушение снимается долгом.
   */
  private channel({ name, base }: UiChannelSpec): SourceLayer {
    const own = `fe-${name}`;
    const fromBase: readonly LayerAccess[] =
      base === undefined
        ? []
        : [{ layer: `fe-${base}`, others: 'none' }, { layer: `${base}-kit` }];
    return {
      name: own,
      axis: 'implementation',
      perModule: this.modules,
      entry: 'public',
      rule: 'UI-31',
      sees: [
        ...PLATFORM,
        { layer: 'ui' },
        { layer: 'fe-app' },
        { layer: 'fe-logic', others: 'none' },
        { layer: `${name}-kit` },
        ...fromBase,
        { layer: own, entries: ['public'], rule: 'UI-32', debt: true },
      ],
      seenBy: SHELL_ENTRY,
    };
  }

  private kit({ name, base }: UiChannelSpec): SourceLayer {
    return {
      name: `${name}-kit`,
      axis: 'implementation',
      rule: 'UI-33',
      sees: [
        ...PLATFORM,
        { layer: 'ui' },
        { layer: 'fe-app' },
        ...(base === undefined ? [] : [{ layer: `${base}-kit` }]),
      ],
      seenBy: SHELL,
    };
  }

  private verifyChannels(): void {
    const names = this.channels.map((c) => c.name);
    for (const { name, base } of this.channels) {
      if (TAKEN_CHANNELS.includes(name)) {
        throw new Error(
          `слои фронта: канал ${name} — слой fe-${name} уже занят, имя канала зарезервировано`,
        );
      }
      if (names.filter((n) => n === name).length > 1) {
        throw new Error(`слои фронта: канал ${name} объявлен дважды`);
      }
      if (base === name) {
        throw new Error(
          `слои фронта: канал ${name} — база не может быть самим каналом`,
        );
      }
      if (base !== undefined && !names.includes(base)) {
        throw new Error(
          `слои фронта: канал ${name} — база ${base} не объявлена в каналах`,
        );
      }
    }
  }

  // Каталог модуля — `<фронт>/<модуль>`, рядом с `<фронт>/app` и
  // `<фронт>/<канал>-kit`: одноимённый модуль занял бы каталог слоя.
  private verifyModules(): void {
    const kits = new Map(this.channels.map((c) => [`${c.name}-kit`, c.name]));
    for (const name of this.modules) {
      if (name === 'app') {
        throw new Error(
          `слои фронта: UI-модуль ${name} — каталог модуля совпал бы со слоем fe-app, имя зарезервировано`,
        );
      }
      const channel = kits.get(name);
      if (channel !== undefined) {
        throw new Error(
          `слои фронта: UI-модуль ${name} — каталог модуля совпал бы со слоем ${name} канала ${channel}, имя занято`,
        );
      }
    }
  }
}
