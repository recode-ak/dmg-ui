import { join } from 'node:path';
import type { PlannedEdit } from 'dmg-core/gen';
import type { FrontLayout } from './front-layout';
import { LineWidth } from './line-width';
import { MarkerIndent } from './marker-indent';

/**
 * Правки описания модуля для нового элемента: импорт и элемент списка в
 * `<m>.ui-module.ts`, реэкспорт из `index.ts` слоя `ui`.
 */
export class ModuleEdits {
  private readonly width = new LineWidth();
  private readonly indent = new MarkerIndent();

  constructor(private readonly front: FrontLayout) {}

  /** def — имя описания, source — файл без расширения от каталога модуля UI, list — список манифеста */
  of(def: string, source: string, list: string): PlannedEdit[] {
    const { front } = this;
    const path = join(front.moduleDir(), `${front.module}.ui-module.ts`);
    const marker = `// gen:${list}`;
    return [
      {
        path,
        marker: '// gen:imports',
        line: this.width.importOf(def, `./${source}`),
      },
      {
        path,
        marker,
        line: `${this.indent.of(path, marker, 4)}${def},`,
      },
      {
        path: join(front.uiDir, 'index.ts'),
        marker: '// gen:exports',
        line: this.width.exportOf(def, `./${front.module}/${source}`),
      },
    ];
  }
}
