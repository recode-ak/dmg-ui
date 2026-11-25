import { UiDeclarations } from './ui-declarations';
import type { UiDeclaration } from './ui-declarations.types';
import { UI_FILE_KINDS } from './ui-file-names.const';
import type {
  UiFileKind,
  UiFilePath,
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';
import { UiFilePlace } from './ui-file-place';
import { UiNamesZones } from './ui-names-zones';
import { UiScreenStories } from './ui-screen-stories';
import { UiTestPlace } from './ui-test-place';

/**
 * Проверка имён файлов UI по `naming.md` (правило `NM-01`, D-UI-112, D-UI-119): суффикс ↔
 * вид объявления, имя `<Имя><Вид>`, место в зоне (`UiFilePlace`), тест рядом, один вид
 * на файл. Диск не читает: файлы со своими путями даёт вызывающий, поэтому класс годится
 * и для тестов потребителя, и для сборки клиента, которая берёт `dmg-ui/testing`.
 */
export class UiFileNames {
  readonly id = 'NM-01';

  private readonly zones: UiNamesZones;

  /** Конфигурация с `{m}` не в `logic` и `channels` или без него там — исключение сразу. */
  constructor(layout: UiNamesLayout) {
    this.zones = new UiNamesZones(layout);
  }

  /**
   * Нарушения `NM-01` в файлах зон: сначала пустые зоны, затем по файлу в порядке входа.
   * Файл вне всех зон, `*.fixture.ts`, `*.test-kit.ts` и `*.browser.test.ts` не проверяются.
   */
  check(files: readonly UiNamesSource[]): UiNamesViolation[] {
    const paths = files.map((file) => file.path);
    const found = this.zones.empty(paths).map((zone) => ({
      file: zone,
      line: 1,
      text: `NM-01 зона: в «${zone}» нет файлов — путь устарел?`,
    }));
    const tests = new UiTestPlace(this.namesByDir(files));
    const place = new UiFilePlace(
      this.zones,
      new Set(paths),
      new UiScreenStories(files, this.zones),
    );
    for (const file of files) {
      const path = this.split(file.path);
      if (!path.base.endsWith('.test.ts')) {
        found.push(...this.checkSource(path, file.text, place));
        continue;
      }
      if (!this.zones.checksTest(path.path)) continue;
      const problem = tests.problem(path.dir, path.base);
      if (problem) {
        found.push({ file: path.path, line: 1, text: `NM-01 ${problem}` });
      }
    }
    return found;
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

  private split(path: string): UiFilePath {
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

  /** Вид файла, суффикс, место и имя файла кода в зонах; одна проблема — одна строка. */
  private checkSource(
    path: UiFilePath,
    source: string,
    place: UiFilePlace,
  ): UiNamesViolation[] {
    if (/\.(fixture|test-kit)\.ts$/.test(path.base)) return [];
    const hit = this.zones.find(path.path);
    if (!hit) return [];
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
    if (kind && !first && kind.declaration) {
      return [at(1, this.missingProblem(kind, path))];
    }

    const found: UiNamesViolation[] = [];
    const misplaced = place.problem(path, kind, hit);
    if (misplaced) found.push(at(first?.line ?? 1, misplaced));
    if (!kind) return found;

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

  private missingProblem(kind: UiFileKind, path: UiFilePath): string {
    const expected = this.expectedName(kind, path.name);
    const how =
      kind.declaration?.form === 'define'
        ? `${kind.declaration.base}.define`
        : `extends ${kind.declaration?.base}`;
    return `суффикс: суффикс «.${kind.suffix}» требует объявления ${expected} (${how}), в файле его нет`;
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

  private suffixProblem(path: UiFilePath, declared: UiDeclaration): string {
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
