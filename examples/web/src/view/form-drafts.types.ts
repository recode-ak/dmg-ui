import type { ExampleRegion } from '../common/example-web.types';

/** Ключ черновика: область, экран, форма и поле. */
export type DraftKey = {
  readonly region: ExampleRegion;
  readonly screen: string;
  readonly form: string;
  readonly field: string;
};
