import { posix } from 'node:path';
import { ModuleSpecifiers } from './module-specifiers';
import type { PackageManifest } from './package-manifest';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Направления между пакетами-каталогами `packages/*`: пакет → пакеты, на которые он может ссылаться. */
export class PackageDirections {
  /** Таблица репо; новый пакет добавляется сюда решением. */
  protected static readonly TABLE: Record<string, string[]> = {
    core: [],
    'chat-ui': ['core'],
    'tg-bot': ['core', 'chat-ui'],
    'web-ui': ['core'],
  };

  /**
   * @param directions пакет → разрешённые пакеты
   * @param entries имя входа (`dmg-ui/x`) → каталог пакета
   * @param entryDirs имя входа → каталог его цели от корня репо
   */
  constructor(
    protected readonly directions: Record<string, string[]>,
    protected readonly entries: Record<string, string>,
    protected readonly entryDirs: Record<string, string> = {},
  ) {}

  /** Таблица репо и входы из `exports` корневого манифеста. */
  static standard(manifest: PackageManifest): PackageDirections {
    return new PackageDirections(
      PackageDirections.TABLE,
      manifest.entries(),
      manifest.entryDirs(),
    );
  }

  scan(files: SourceFile[]): Violation[] {
    return files.flatMap((file) => this.scanFile(file));
  }

  protected scanFile(file: SourceFile): Violation[] {
    const pkg = /^packages\/([^/]+)\//.exec(file.path)?.[1];
    if (!pkg) return [];
    const allowed = this.directions[pkg];
    if (!allowed) {
      return [
        {
          file: file.path,
          line: 1,
          text: `пакет «${pkg}» не описан в таблице направлений: обнови таблицу`,
        },
      ];
    }
    const found: Violation[] = [];
    for (const { specifier, line } of new ModuleSpecifiers(file).list()) {
      const reason = this.reason(file.path, pkg, allowed, specifier);
      if (reason) found.push({ file: file.path, line, text: reason });
    }
    return found;
  }

  protected reason(
    path: string,
    pkg: string,
    allowed: string[],
    specifier: string,
  ): string | undefined {
    if (specifier.startsWith('.')) {
      const target = posix.join(posix.dirname(path), specifier);
      return target.startsWith(`packages/${pkg}/`)
        ? undefined
        : `«${specifier}» выходит из каталога пакета «${pkg}»`;
    }
    const entry = this.entries[specifier];
    if (entry !== undefined) {
      const dir = this.entryDirs[specifier];
      if (dir !== undefined && path.startsWith(`${dir}/`)) {
        return `«${specifier}» не импортируют из его же каталога: внутри входа — относительные пути`;
      }
      return entry === pkg || allowed.includes(entry)
        ? undefined
        : `нет направления «${pkg}» → «${entry}» («${specifier}»)`;
    }
    return this.isOwnName(specifier)
      ? `«${specifier}» — не вход из exports: соседа импортируют по имени входа`
      : undefined;
  }

  protected isOwnName(specifier: string): boolean {
    const root = specifier.split('/')[0];
    return Object.keys(this.entries).some(
      (name) => name.split('/')[0] === root,
    );
  }
}
