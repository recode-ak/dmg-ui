import { join, relative, sep } from 'node:path';
import type { GenLayout, LayerPackage } from 'dmg-core/gen';
import {
  CHANNEL_TECHS,
  FRONT_PREFIX,
  LOGIC_LAYER,
  TAKEN_CHANNELS,
  UI_LAYER,
} from './front-layout.const';
import type { FrontChannel } from './front-layout.types';

/**
 * Три дерева модуля UI по `layers` проекта: описание (`ui`, модуль — в
 * каталоге `<ui>/<m>`), код (`fe-logic`) и каналы (`fe-<канал>`). Нет слоя
 * `ui` или `fe-logic` — `GenError` раскладки при создании.
 */
export class FrontLayout {
  /** Каталог слоя описания от корня проекта: в нём набор и `index.ts` */
  readonly uiDir: string;
  /** Каталог кода модуля */
  readonly logicDir: string;

  constructor(
    private readonly layout: GenLayout,
    readonly module: string,
  ) {
    this.uiDir = layout.layerDir(UI_LAYER, module);
    this.logicDir = layout.layerDir(LOGIC_LAYER, module);
  }

  /** Каталог описания модуля: `<ui>/<m>` */
  moduleDir(): string {
    return join(this.uiDir, this.module);
  }

  /** Каналы — слои `fe-<канал>` в порядке конфига, кроме `fe-app` и `fe-logic` */
  channels(): FrontChannel[] {
    return this.layout.layerNames().flatMap((layer) => {
      if (!layer.startsWith(FRONT_PREFIX)) return [];
      const name = layer.slice(FRONT_PREFIX.length);
      if (TAKEN_CHANNELS.includes(name)) return [];
      const dir = this.layout.layerDir(layer, this.module);
      const tech = CHANNEL_TECHS.get(name);
      return [
        tech === undefined ? { name, layer, dir } : { name, layer, dir, tech },
      ];
    });
  }

  /** Пакет слоя для модуля; у слоя нет `package` — undefined */
  packageOf(layer: string): LayerPackage | undefined {
    return this.layout.layerPackage(layer, this.module);
  }

  /** Спецификатор импорта описания из каталога fromDir: имя пакета `ui`, иначе относительный путь */
  uiImport(fromDir: string): string {
    const pkg = this.packageOf(UI_LAYER);
    if (pkg !== undefined) return pkg.name;
    const path = relative(fromDir, this.uiDir).split(sep).join('/');
    return path.startsWith('.') ? path : `./${path}`;
  }

  /** Путь от корня проекта через `/` — для заметок и `workspaces` */
  fromRoot(path: string): string {
    return relative(this.layout.root, path).split(sep).join('/');
  }
}
