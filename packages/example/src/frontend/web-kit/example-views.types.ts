import type { AnyScreenDef, InstanceView } from 'dmg-ui';
import type { ScreenBody, ScreenControls } from './region-model.types';

/** Представление экрана на DOM без генерика — так его хранит реестр. */
export type AnyExampleScreen = {
  readonly def: AnyScreenDef;
  body(view: InstanceView, controls: ScreenControls): ScreenBody;
};
