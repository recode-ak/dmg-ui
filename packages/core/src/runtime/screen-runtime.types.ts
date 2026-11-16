import type { TraceJson } from 'dmg-core';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { CodeLoaders } from './code-loaders';
import type { RenderContext } from './context.types';
import type { RefreshPort, UcPort } from './ports.types';
import type { UiObserver } from './ui-observer.types';

/** Исполнитель одной личности: набор, загрузчики кода, порты, наблюдатель. */
export type ScreenRuntimeSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: CodeLoaders;
  readonly ucs: UcPort;
  readonly refresh: RefreshPort;
  readonly observer: UiObserver;
};

/** Параметры открытия от канала: контекст рендера и след входящего сигнала. */
export type OpenOptions = {
  readonly context: RenderContext;
  readonly trace: TraceJson;
};
