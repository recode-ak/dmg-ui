import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { AppCodeLoaders } from './app-code-loaders';

/** Превью набора UI: набор и сборка кода того же набора; портов нет. */
export type ScreenPreviewSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: AppCodeLoaders;
};

/** Уведомление по примеру: `id` узла и данные примера по схеме. */
export type NotificationPreview = {
  readonly notification: string;
  readonly data: unknown;
};
