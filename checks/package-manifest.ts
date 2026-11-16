import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Корневой `package.json`: `exports`, зависимости и сопоставление «вход → каталог пакета». */
export class PackageManifest {
  protected constructor(protected readonly json: Record<string, unknown>) {}

  static read(root: string): PackageManifest {
    return PackageManifest.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    );
  }

  static parse(text: string): PackageManifest {
    return new PackageManifest(JSON.parse(text) as Record<string, unknown>);
  }

  /** Ключ входа → цель (`./packages/...`). */
  exports(): Record<string, string> {
    return (this.json.exports ?? {}) as Record<string, string>;
  }

  /** Имена из `dependencies`; пустой список, если поля нет. */
  dependencies(): string[] {
    return this.names('dependencies');
  }

  /** Имена из `peerDependencies`. */
  peerDependencies(): string[] {
    return this.names('peerDependencies');
  }

  /** Имя входа (`dmg-ui`, `dmg-ui/tg-bot`) → каталог пакета под `packages/`. Цель вне `packages/` — исключение. */
  entries(): Record<string, string> {
    const name = String(this.json.name);
    const result: Record<string, string> = {};
    for (const [key, target] of Object.entries(this.exports())) {
      const match = /^\.\/packages\/([^/]+)\//.exec(target);
      if (!match?.[1]) {
        throw new Error(
          `exports["${key}"] = ${target}: цель вне packages/<пакет>/`,
        );
      }
      result[key === '.' ? name : `${name}/${key.slice(2)}`] = match[1];
    }
    return result;
  }

  protected names(field: string): string[] {
    return Object.keys((this.json[field] ?? {}) as object);
  }
}
