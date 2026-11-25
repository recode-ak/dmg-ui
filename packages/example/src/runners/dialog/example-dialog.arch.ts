import { join } from 'node:path';
import type { ArchApp } from 'dmg-core/arch';
import { EXAMPLE_PLACES } from '../example-arch.const';
import { ExampleDialogGraph } from './example-dialog.graph';

/**
 * Граф учебного примера для `arch:check`: состав — из входа графа
 * `ExampleDialogGraph`, места слоёв и раннеры — общие с графом `web`.
 * Файл лежит в раннере, мимо слоёв.
 * @see ./example-dialog.arch.test.ts
 */
export const ExampleDialogArch: ArchApp = {
  ...ExampleDialogGraph,
  ...EXAMPLE_PLACES,
  graphEntry: join(import.meta.dir, 'example-dialog.graph.ts'),
};
