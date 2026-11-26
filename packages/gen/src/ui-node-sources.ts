import { DMG_UI } from './dmg-ui.const';
import type { ChannelTech } from './front-layout.types';
import { ImportLines } from './import-lines';
import { LineWidth } from './line-width';
import { UiName } from './ui-name';
import { VALIBOT } from './ui-node.const';
import type { UiNodeSpec } from './ui-node.types';

/**
 * Тексты файлов экрана или уведомления в форме biome: описание, код с
 * заглушкой `load`, представление канала, строки правок реестров.
 */
export class UiNodeSources {
  private readonly name: UiName;
  private readonly width = new LineWidth();
  private readonly imports = new ImportLines();

  constructor(
    private readonly spec: UiNodeSpec,
    readonly node: string,
    readonly module: string,
  ) {
    this.name = new UiName(node);
  }

  /** Имя описания: `CourseCardScreenDef` */
  defName(): string {
    return `${this.name.pascal()}${this.spec.part}Def`;
  }

  /** Имя кода: `CourseCardScreenCode` */
  codeName(): string {
    return `${this.name.pascal()}${this.spec.part}Code`;
  }

  /** Имя представления: `CourseCardView` */
  viewName(): string {
    return `${this.name.pascal()}View`;
  }

  /** Файл описания в папке модуля UI: `<папка>/<имя>.screen` без расширения */
  defModule(folder: string): string {
    return `${folder}/${this.node}.${this.spec.kind}`;
  }

  /** Источник загрузчика кода от каталога логики: `./<папка>/<имя>.scode` */
  codeModule(folder: string): string {
    return `./${folder}/${this.node}.${this.spec.codeSuffix}`;
  }

  /** Источник представления от каталога канала: `./<папка>/<имя>.view` */
  viewModule(folder: string): string {
    return `./${folder}/${this.node}.view`;
  }

  /** Строка списка модуля или сторис: элемент с отступом маркера */
  item(name: string, indent: string): string {
    return `${indent}${name},`;
  }

  /** Описание узла: манифест с заглушками `TODO` */
  def(): string {
    const part = this.spec.part;
    const def = this.defName();
    return `${this.imports.of([{ name: `${part}Def`, from: DMG_UI }])}
import * as v from '${VALIBOT}';

/** ${this.spec.subject} \`${this.name.camel()}\` модуля \`${this.module}\`. */
${this.width.define(`export const ${def} =`, `${part}Def.define`, this.spec.body(this.name.camel()))}`;
  }

  /** Код узла: класс-заглушка, не знающий данных; uiImport — спецификатор описания */
  code(uiImport: string): string {
    const part = this.spec.part;
    const base = `${part}Code`;
    return `${this.imports.of([
      { name: base, from: DMG_UI },
      { name: this.defName(), from: uiImport, type: true },
    ])}

/** Код \`${this.name.camel()}\`: загрузка — заглушка до реализации. */
${this.width.extend(
  `export class ${this.codeName()}`,
  base,
  `typeof ${this.defName()}`,
  [
    'override async load(): Promise<never> {',
    `  throw new Error('TODO: реализовать загрузку');`,
    '}',
  ],
)}`;
  }

  /** Представление узла в канале с шаблоном */
  view(tech: ChannelTech, uiImport: string): string {
    const def = this.defName();
    return `${this.imports.of([
      { name: tech[this.spec.kind], from: tech.entry },
      { name: def, from: uiImport },
    ])}

/** Представление \`${this.name.camel()}\` в канале: подпись — название из описания. */
${this.width.invoke(
  `export const ${this.viewName()} =`,
  `${tech[this.spec.kind]}.for`,
  [def, `() => ${def}.label`],
)}`;
  }

  /** Загрузчик кода для `// gen:codes` с отступом маркера; не помещается — по форме biome */
  loader(folder: string, indent: string): string {
    const call = `new (await import('${this.codeModule(folder)}')).${this.codeName()}(),`;
    const spec = this.codeModule(folder);
    const wait = `await import('${spec}')`;
    const body = this.width.fits(`${indent}    ${call}`)
      ? [`    ${call}`]
      : [
          '    new (',
          ...(this.width.fits(`${indent}      ${wait}`)
            ? [`      ${wait}`]
            : ['      await import(', `        '${spec}'`, '      )']),
          `    ).${this.codeName()}(),`,
        ];
    return [
      `CodeLoader.${this.spec.kind}(`,
      `  ${this.defName()},`,
      '  async () =>',
      ...body,
      '),',
    ]
      .map((row) => `${indent}${row}`)
      .join('\n');
  }
}
