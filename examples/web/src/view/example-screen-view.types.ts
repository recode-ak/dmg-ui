import type { AnyScreenDef, ScreenViewOf } from 'dmg-ui';
import type { ScreenBody, ScreenControls } from './region-model.types';

/** Построение тела экрана по его виду в типах экрана и готовым действиям и формам. */
export type ExampleBodyBuild<D extends AnyScreenDef> = (
  view: ScreenViewOf<D>,
  controls: ScreenControls,
) => ScreenBody;
