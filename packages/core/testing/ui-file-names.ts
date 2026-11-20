import { UiDeclarations } from './ui-declarations';
import type { UiDeclaration } from './ui-declarations.types';
import { UI_FILE_KINDS } from './ui-file-names.const';
import type {
  UiFileKind,
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';
import { UiTestPlace } from './ui-test-place';

/** Части пути файла: каталог, имя с расширением, `<имя>` до первой точки, суффикс между ней и `.ts`. */
type FilePath = {
  readonly path: string;
  readonly dir: string;
  readonly base: string;
  readonly name: string;
  readonly suffix: string | undefined;
};

/**
 * Проверка имён файлов UI по `naming.md` (правило `NM-01`, D-UI-112): суффикс ↔ вид
 * объявления, имя `<Имя><Вид>`, место в папке UI-модуля, тест рядом, один вид на файл.
 * Диск не читает: файлы со своими путями даёт вызывающий, поэтому класс годится и для
 * тестов потребителя, и для сборки клиента, которая берёт `dmg-ui/testing`.
 */
export class UiFileNames {
  readonly id = 'NM-01';

  constructor(private readonly layout: UiNamesLayout) {}

  /**
   * Нарушения `NM-01` в файлах зон: сначала пустые зоны, затем по файлу в порядке входа.
   * Файл вне всех зон, `*.fixture.ts`, `*.test-kit.ts` и `*.browser.test.ts` не проверяются.
   */
  check(files: readonly UiNamesSource[]): UiNamesViolation[] {
    const found = this.emptyZones(files);
    const inDirs = this.namesByDir(files);
    const tests = new UiTestPlace(inDirs);
    const testZones = [
      ...this.layout.sets,
      ...(this.layout.channels ?? []),
      ...(this.layout.tests ?? []),
    ];
    for (const file of files) {
      const path = this.split(file.path);
      if (!path.base.endsWith('.test.ts')) {
        found.push(...this.checkSource(path, file.text, inDirs));
        continue;
      }
      if (!this.zone(path.path, testZones)) continue;
      const problem = tests.problem(path.dir, path.base);
      if (problem) {
        found.push({ file: path.path, line: 1, text: `NM-01 ${problem}` });
      }
    }
    return found;
  }

  private emptyZones(files: readonly UiNamesSource[]): UiNamesViolation[] {
    const zones = new Set(
      [
        ...this.layout.sets,
        ...(this.layout.channels ?? []),
        ...(this.layout.others ?? []),
        ...(this.layout.tests ?? []),
      ].map((zone) => zone.replace(/\/+$/, '')),
    );
    return [...zones]
      .filter((zone) => !files.some((f) => f.path.startsWith(`${zone}/`)))
      .map((zone) => ({
        file: zone,
        line: 1,
        text: `NM-01 зона: в «${zone}» нет файлов — путь устарел?`,
      }));
  }

  private namesByDir(
    files: readonly UiNamesSource[],
  ): Map<string, Set<string>> {
    const byDir = new Map<string, Set<string>>();
    for (const file of files) {
      const { dir, base } = this.split(file.path);
      const names = byDir.get(dir) ?? new Set<string>();
      names.add(base);
      byDir.set(dir, names);
    }
    return byDir;
  }

  private split(path: string): FilePath {
    const slash = path.lastIndexOf('/');
    const base = path.slice(slash + 1);
    const stem = base.replace(/\.ts$/, '');
    const dot = stem.indexOf('.');
    return {
      path,
      dir: path.slice(0, Math.max(slash, 0)),
      base,
      name: dot < 0 ? stem : stem.slice(0, dot),
      suffix: dot < 0 ? undefined : stem.slice(dot + 1),
    };
  }

  private zone(path: string, zones: readonly string[] | undefined) {
    return zones
      ?.map((zone) => zone.replace(/\/+$/, ''))
      .find((zone) => path.startsWith(`${zone}/`));
  }

  /** Суффикс, вид файла, место и имя файла кода в зонах наборов, каналов и прочего UI. */
  private checkSource(
    path: FilePath,
    source: string,
    inDirs: Map<string, Set<string>>,
  ): UiNamesViolation[] {
    if (/\.(fixture|test-kit)\.ts$/.test(path.base)) return [];
    const set = this.zone(path.path, this.layout.sets);
    const channel = this.zone(path.path, this.layout.channels);
    if (!set && !channel && !this.zone(path.path, this.layout.others)) {
      return [];
    }
    const text = new UiDeclarations(source);
    const at = (line: number, problem: string): UiNamesViolation => ({
      file: path.path,
      line,
      text: `NM-01 ${problem}`,
    });

    const declarations = text.declared();
    const [first, second] = declarations;
    if (second) return [at(second.line, this.oneKindProblem(declarations))];

    const kind = UI_FILE_KINDS.find((k) => k.suffix === path.suffix);
    if (first && first.kind !== kind) {
      return [at(first.line, this.suffixProblem(path, first))];
    }
    if (!kind) return [];
    if (!first && kind.declaration) {
      const expected = this.expectedName(kind, path.name);
      const how =
        kind.declaration.form === 'define'
          ? `${kind.declaration.base}.define`
          : `extends ${kind.declaration.base}`;
      return [
        at(
          1,
          `суффикс: суффикс «.${kind.suffix}» требует объявления ${expected} (${how}), в файле его нет`,
        ),
      ];
    }

    const found: UiNamesViolation[] = [];
    const place = set
      ? this.setPlaceProblem(path, kind, set, inDirs)
      : channel && kind.side === 'set'
        ? `место: «.${kind.suffix}» — сторона набора UI, файл лежит в канале`
        : undefined;
    if (place) found.push(at(first?.line ?? 1, place));

    const expected = this.expectedName(kind, path.name);
    const exported = first ? [first] : text.exported();
    if (!exported.some((e) => e.name === expected)) {
      const actual = exported.length
        ? `объявлено ${exported.map((e) => e.name).join(', ')}`
        : 'экспортов нет';
      found.push(
        at(
          exported[0]?.line ?? 1,
          `имя: ожидается ${expected} (от «${path.name}»), ${actual}`,
        ),
      );
    }
    return found;
  }

  private setPlaceProblem(
    path: FilePath,
    kind: UiFileKind,
    set: string,
    inDirs: Map<string, Set<string>>,
  ): string | undefined {
    if (kind.side === 'channel') {
      return `место: «.${kind.suffix}» — сторона канала, файл лежит в наборе UI`;
    }
    const parts = path.path.slice(set.length + 1).split('/');
    if (kind.suffix === 'set') {
      return parts.length === 1
        ? undefined
        : `место: «.set» лежит вне корня набора — ожидается ${set}/${path.base}`;
    }
    if (kind.suffix === 'ui-module') {
      return parts.length === 2 && parts[0] === path.name
        ? undefined
        : `место: UI-модуль «${path.name}» лежит не в своей папке — ожидается ${set}/${path.name}/${path.base}`;
    }
    if (parts.length !== 2) {
      return `место: вид «${kind.suffix}» лежит вне папки UI-модуля — ожидается ${set}/<модуль>/${path.base}`;
    }
    const folder = parts[0];
    return inDirs.get(path.dir)?.has(`${folder}.ui-module.ts`)
      ? undefined
      : `место: в папке «${folder}» есть файлы набора UI, но нет ${folder}.ui-module.ts`;
  }

  private oneKindProblem(declarations: readonly UiDeclaration[]): string {
    const bases = new Set(declarations.map((d) => d.kind.declaration?.base));
    if (bases.size > 1) {
      const listed = declarations
        .map((d) => `${d.kind.declaration?.base} (${d.name})`)
        .join(' и ');
      return `вид файла: объявлены ${listed} — один файл, один вид`;
    }
    const names = declarations.map((d) => d.name).join(', ');
    return `вид файла: объявлений ${[...bases][0]}: ${declarations.length} (${names}) — один файл, одно объявление`;
  }

  private suffixProblem(path: FilePath, declared: UiDeclaration): string {
    const declaration = declared.kind.declaration;
    const what =
      declaration?.form === 'extends'
        ? `класс ${declared.name} наследует ${declaration.base}`
        : `объявлен ${declaration?.base} (${declared.name})`;
    const actual = path.suffix
      ? `суффикс файла «.${path.suffix}»`
      : 'у файла нет суффикса вида';
    return `суффикс: ${what}, ${actual}, для ${declaration?.label} — «.${declared.kind.suffix}»`;
  }

  /** `<Имя><Вид>` или `<имя><Вид>` от kebab-имени файла: `task-list` → `TaskListScreenDef`. */
  private expectedName(kind: UiFileKind, name: string): string {
    const pascal = name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
    const head =
      kind.head === 'pascal'
        ? pascal
        : pascal.charAt(0).toLowerCase() + pascal.slice(1);
    return `${head}${kind.ending}`;
  }
}
