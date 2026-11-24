import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';

/**
 * Канал проекта для слоёв фронта: имя — часть имён слоёв (`fe-<имя>`,
 * `<имя>-kit`), база — канал, чей код и общее канал видит сверх своих.
 */
export type UiChannelSpec = {
  readonly name: string;
  readonly base?: string;
};

/**
 * Что описывает поставщик: набор UI, его приложения UI и каналы проекта.
 * Каналы обязательны: проект без них пишет `[]` явно, и код каналов не
 * остаётся вне слоёв незаметно.
 */
export type UiGraphSpec = {
  readonly set: AnyUiSetDef;
  readonly apps: readonly AnyUiAppDef[];
  readonly channels: readonly UiChannelSpec[];
};
