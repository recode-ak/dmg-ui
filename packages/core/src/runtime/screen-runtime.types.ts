import type { TraceJson } from 'dmg-core';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { CodeLoaders } from './code-loaders';
import type { RenderContext } from './context.types';
import type { RefreshPort, UcPort } from './ports.types';
import type { UiFault, UiObserver } from './ui-observer.types';

/** Исполнитель одной личности: набор, загрузчики кода, порты, наблюдатель. */
export type ScreenRuntimeSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: CodeLoaders;
  readonly ucs: UcPort;
  readonly refresh: RefreshPort;
  readonly observer: UiObserver;
  /**
   * Приложение UI канала: действие, ведущее только в сторис вне него, не
   * показывается и не исполняется. Без приложения ничего не отрезано.
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
