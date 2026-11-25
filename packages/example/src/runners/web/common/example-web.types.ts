import type { EXAMPLE_REGIONS } from './example-web.const';

/** Область страницы примера: основная, соседняя или модальная. */
export type ExampleRegion = (typeof EXAMPLE_REGIONS)[number];
