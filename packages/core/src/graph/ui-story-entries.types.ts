import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { UiStartsFromProps } from './ui-props.types';

/** Переход на экран набора и условие, при котором он для сторис не вход. */
export type UiStoryIncoming = {
  readonly record: UiStartsFromProps;
  /** Экран действия: сторис, включающей его, переход входа не даёт. */
  readonly owner?: AnyScreenDef;
};
