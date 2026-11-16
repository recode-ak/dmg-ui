import { Def } from 'dmg-core';
import type { AnyNotificationDef } from './notification-def.types';
import type { AnyScreenDef } from './screen-def.types';
import type { AnyStoryDef } from './story-def.types';
import type { NormalizedUiModule, UiModuleSpec } from './ui-module-def.types';

export type {
  AnyUiModuleDef,
  NormalizedUiModule,
  UiModuleSpec,
} from './ui-module-def.types';

/** Манифест UI-модуля: экраны, сторис и уведомления одной области. */
export class UiModuleDef<N extends string = string> extends Def<N> {
  readonly dmg = 'uiModule';
  readonly screens: readonly AnyScreenDef[];
  readonly stories: readonly AnyStoryDef[];
  readonly notifications: readonly AnyNotificationDef[];

  constructor(spec: UiModuleSpec<N>) {
    super(spec);
    this.screens = spec.screens;
    this.stories = spec.stories;
    this.notifications = spec.notifications ?? [];
  }

  static define<const N extends string>(spec: UiModuleSpec<N>): UiModuleDef<N> {
    return new UiModuleDef<N>(spec);
  }

  normalize(): NormalizedUiModule {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      screens: this.screens.map((s) => s.name),
      stories: this.stories.map((s) => s.name),
      notifications: this.notifications.map((n) => n.name),
    };
  }
}
