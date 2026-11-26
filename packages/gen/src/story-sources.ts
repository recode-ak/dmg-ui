import { DMG_UI } from './dmg-ui.const';
import { ImportLines } from './import-lines';
import { LineWidth } from './line-width';
import { UiName } from './ui-name';

/** Текст файла сторис в форме biome: экран `start`, маркеры списков, заглушки `TODO` */
export class StorySources {
  private readonly name: UiName;
  private readonly width = new LineWidth();
  private readonly imports = new ImportLines();

  constructor(
    readonly story: string,
    readonly module: string,
  ) {
    this.name = new UiName(story);
  }

  /** Имя описания: `BrowseStoryDef` */
  defName(): string {
    return `${this.name.pascal()}StoryDef`;
  }

  /** Источник сторис от каталога модуля UI: `<сторис>/<сторис>.story` */
  defModule(): string {
    return `${this.story}/${this.story}.story`;
  }

  /** Файл сторис: экран `start` (определение и источник) задан */
  text(start: string, startModule: string): string {
    return `${this.imports.of([
      { name: 'StoryDef', from: DMG_UI },
      { name: start, from: startModule },
    ])}
// gen:imports

/** Сторис \`${this.name.camel()}\` модуля \`${this.module}\`. */
${this.width.define(`export const ${this.defName()} =`, 'StoryDef.define', [
  `name: '${this.name.camel()}',`,
  "label: 'TODO: название сторис',",
  "description: 'TODO: что человек делает в сторис',",
  "callers: ['user'],",
  "goal: 'TODO: чтобы …',",
  `start: ${start},`,
  'screens: [',
  `  ${start},`,
  '  // gen:screens',
  '],',
  'outcomes: {',
  '  done: {',
  "    label: 'TODO: итог сторис',",
  "    description: 'TODO: когда сторис завершена',",
  `    exits: [${start}.exits.done],`,
  '  },',
  '},',
])}`;
  }
}
