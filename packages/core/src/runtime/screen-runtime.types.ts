import type { TraceJson } from 'dmg-core';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { AppCodeLoaders } from './app-code-loaders';
import type { RenderContext } from './context.types';
import type { RefreshPort, UcPort } from './ports.types';
import type { UiFault, UiObserver } from './ui-observer.types';

/**
 * Исполнитель одной личности: набор, сборка кода его области (приложения
 * или набора без приложения), порты, наблюдатель.
 */
export type ScreenRuntimeSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: AppCodeLoaders;
  readonly ucs: UcPort;
  readonly refresh: RefreshPort;
  readonly observer: UiObserver;
  /**
   * Приложение UI канала (D-UI-95, D-UI-107): действие, ведущее только в
   * сторис вне него, не показывается и не исполняется; дверь без своей
   * подсказки получает подсказку сторис-цели. Без приложения ничего не
   * отрезано и подсказки дверей не подставляются.
   */
  readonly app?: AnyUiAppDef;
  /** Точка диагностики: сырые броски кода экрана и слушателей. */
  readonly faults?: (fault: UiFault) => void;
};

/** Параметры открытия от канала: контекст рендера и след входящего сигнала. */
export type OpenOptions = {
  readonly context: RenderContext;
  readonly trace: TraceJson;
};
