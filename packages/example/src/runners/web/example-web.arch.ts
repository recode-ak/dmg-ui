import { join } from 'node:path';
import type { ArchApp } from 'dmg-core/arch';
import { EXAMPLE_PLACES } from '../example-arch.const';
import { ExampleWebGraph } from './example-web.graph';

/**
 * Граф примера для браузера и для `arch:check`: состав — из входа графа
 * `ExampleWebGraph`, места слоёв и раннеры — общие с графом `dialog`.
 * Файл лежит в раннере, мимо слоёв.
 * @see ./example-web.arch.test.ts
 */
export const ExampleWebArch: ArchApp = {
  ...ExampleWebGraph,
  ...EXAMPLE_PLACES,
  graphEntry: join(import.meta.dir, 'example-web.graph.ts'),
};
