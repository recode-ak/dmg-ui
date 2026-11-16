import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { CodeLoaders } from './code-loaders';

/** Превью набора UI: набор и загрузчики кода того же набора; портов нет. */
export type ScreenPreviewSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: CodeLoaders;
};

/** Уведомление по примеру: `id` узла и данные примера по схеме. */
export type NotificationPreview = {
  readonly notification: string;
  readonly data: unknown;
};
