import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GenError } from 'dmg-core/gen';
import { DMG_UI } from './dmg-ui.const';
import type { RootManifestJson } from './root-manifest.types';

/**
 * `package.json` корня проекта: строка версии `dmg-ui` для пакетов единиц и
 * каталоги `workspaces`. Нет файла — пустой манифест; не JSON-объект —
 * `GenError`.
 */
export class RootManifest {
  static read(root: string): RootManifest {
    const path = join(root, 'package.json');
    if (!existsSync(path)) return new RootManifest({});
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new GenError(`package.json корня — не JSON: ${String(error)}`);
    }
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      throw new GenError('package.json корня — не объект JSON');
    }
    return new RootManifest(json);
  }

  constructor(private readonly json: RootManifestJson) {}

  /** Строка `dmg-ui` корня: из `dependencies`, иначе из `devDependencies` */
  dmgUi(): string | undefined {
    return (
      this.versionIn(this.json.dependencies) ??
      this.versionIn(this.json.devDependencies)
    );
  }

  /**
   * Каталог (от корня, через `/`) покрыт шаблоном `workspaces` корня:
   * массивом или `{ packages: [...] }`; ведущий `./` шаблона не учитывается
   */
  covers(dir: string): boolean {
    return this.workspaces().some((pattern) =>
      new Bun.Glob(pattern.replace(/^\.\//, '')).match(dir),
    );
  }

  private workspaces(): string[] {
    const { workspaces } = this.json;
    const list =
      typeof workspaces === 'object' &&
      workspaces !== null &&
      !Array.isArray(workspaces)
        ? Reflect.get(workspaces, 'packages')
        : workspaces;
    return Array.isArray(list)
      ? list.filter((pattern) => typeof pattern === 'string')
      : [];
  }

  private versionIn(section: unknown): string | undefined {
    if (typeof section !== 'object' || section === null) return undefined;
    const version: unknown = Reflect.get(section, DMG_UI);
    return typeof version === 'string' ? version : undefined;
  }
}
