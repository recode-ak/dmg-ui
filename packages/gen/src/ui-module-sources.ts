import type { LayerPackage } from 'dmg-core/gen';
import { DMG_UI } from './dmg-ui.const';
import type { ChannelTech } from './front-layout.types';
import { ImportLines } from './import-lines';
import { LineWidth } from './line-width';
import { PACKAGE_TEST } from './ui-module-sources.const';
import { UiName } from './ui-name';

/**
 * Тексты файлов пустого UI-модуля в форме biome примера. Маркеры
 * `// gen:*` — места, куда виды сторис, экрана и уведомления дописывают
 * импорты и элементы списков.
 */
export class UiModuleSources {
  private readonly name: UiName;
  private readonly width = new LineWidth();
  private readonly imports = new ImportLines();

  constructor(readonly module: string) {
    this.name = new UiName(module);
  }

  /** Имя описания модуля: `CoursesUiModuleDef` */
  defName(): string {
    return `${this.name.pascal()}UiModuleDef`;
  }

  /** Имя реестра кода: `coursesCodes` */
  codesName(): string {
    return `${this.name.camel()}Codes`;
  }

  /** Имя реестра представлений канала: `coursesChatViews` */
  viewsName(channel: string): string {
    return `${this.name.camel()}${new UiName(channel).pascal()}Views`;
  }

  /** Перекрытия канала на базе: `courses<База>Views.over` */
  overName(): string {
    return `${this.name.camel()}<База>Views.over`;
  }

  /** Строка экспорта описания модуля из `index.ts` слоя `ui` */
  exportLine(): string {
    return `export { ${this.defName()} } from './${this.module}/${this.module}.ui-module';`;
  }

  /** `<m>.ui-module.ts` — описание модуля, списки пусты */
  uiModule(): string {
    const m = this.module;
    return `${this.imports.of([{ name: 'UiModuleDef', from: DMG_UI }])}
// gen:imports

/** UI-модуль \`${m}\`: его экраны, сторис и уведомления. */
${this.width.define(`export const ${this.defName()} =`, 'UiModuleDef.define', [
  `name: '${m}',`,
  "label: 'TODO: название модуля',",
  "description: 'TODO: что даёт модуль',",
  ...['screens', 'stories', 'notifications'].flatMap((list) => [
    `${list}: [`,
    `  // gen:${list}`,
    '],',
  ]),
])}`;
  }

  /** `index.ts` кода модуля */
  logicIndex(): string {
    const m = this.module;
    return `// Реестр кода модуля \`${m}\`: сборка кода модуля
// для оболочки (UI-34).

${this.width.exportOf(this.codesName(), `./${m}-codes`)}
`;
  }

  /** `<m>-codes.ts` — реестр кода модуля; uiImport — спецификатор описания */
  codes(uiImport: string): string {
    const def = this.defName();
    return `${this.imports.of([
      { name: 'CodeLoaders', from: DMG_UI },
      { name: def, from: uiImport },
    ])}
// gen:imports

/** Реестр кода модуля \`${this.module}\`. */
${this.width.registry(
  `export const ${this.codesName()} =`,
  'CodeLoaders.of',
  def,
  '// gen:codes',
  '(): CodeLoaders =>',
)}`;
  }

  /** `index.ts` канала модуля */
  channelIndex(channel: string): string {
    return `// Канал \`${channel}\` модуля \`${this.module}\`: реестр представлений
// модуля для сборок канала (UI-34).

${this.width.exportOf(
  this.viewsName(channel),
  `./${this.module}-${channel}.views`,
)}
`;
  }

  /** `<m>-<канал>.views.ts` — реестр представлений модуля в канале */
  views(channel: string, tech: ChannelTech, uiImport: string): string {
    const def = this.defName();
    return `${this.imports.of([
      { name: tech.factory, from: tech.entry },
      { name: def, from: uiImport },
    ])}
// gen:imports

/** Представления модуля \`${this.module}\` в канале \`${channel}\`. */
${this.width.registry(
  `export const ${this.viewsName(channel)} =`,
  `${tech.factory}.of`,
  def,
  '// gen:views',
)}`;
  }

  /** `package.json` пакета единицы: вход `src/index.ts`, описание и `dmg-ui` */
  packageJson(pkg: LayerPackage, ui: LayerPackage, dmgUi: string): string {
    const manifest = {
      name: pkg.name,
      private: true,
      type: 'module',
      exports: { '.': './src/index.ts' },
      scripts: { test: PACKAGE_TEST },
      dependencies: { [ui.name]: 'workspace:*', [DMG_UI]: dmgUi },
    };
    return `${JSON.stringify(manifest, null, 2)}\n`;
  }

  /** `tsconfig.json` пакета единицы поверх корневого; короткий массив — в строку, как у biome */
  tsconfig(pkg: LayerPackage): string {
    return `{
  "extends": "${pkg.root}/tsconfig.json",
  "include": ["src"]
}
`;
  }
}
