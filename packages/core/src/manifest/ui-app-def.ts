import { Def } from 'dmg-core';
import type { AnyNotificationDef } from './notification-def.types';
import type { AnyStoryDef } from './story-def.types';
import type { EntrySpec, NormalizedUiApp, UiAppSpec } from './ui-app-def.types';
import type { AnyUiSetDef } from './ui-set-def.types';

export type {
  AnyUiAppDef,
  EntrySpec,
  NormalizedEntry,
  NormalizedUiApp,
  UiAppSpec,
} from './ui-app-def.types';

/**
 * Манифест приложения UI: набор UI в одном канале — какие сторис и
 * уведомления доступны и с каких входов начинается работа.
 */
export class UiAppDef<N extends string = string> extends Def<N> {
  readonly dmg = 'uiApp';
  readonly set: AnyUiSetDef;
  readonly channel: string;
  readonly stories: readonly AnyStoryDef[];
  readonly notifications: readonly AnyNotificationDef[];
  readonly entries: Readonly<Record<string, EntrySpec>>;

  constructor(spec: UiAppSpec<N>) {
    super(spec);
    this.set = spec.set;
    this.channel = spec.channel;
    this.stories = spec.stories;
    this.notifications = spec.notifications ?? [];
    this.entries = spec.entries;
  }

  static define<const N extends string>(spec: UiAppSpec<N>): UiAppDef<N> {
    return new UiAppDef<N>(spec);
  }

  normalize(): NormalizedUiApp {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      set: this.set.name,
      channel: this.channel,
      stories: this.stories.map((s) => s.name),
      notifications: this.notifications.map((n) => n.name),
      entries: Object.entries(this.entries).map(([name, e]) => ({
        name,
        label: e.label,
        description: e.description,
        screen: e.address.screen.name,
        params: e.address.params,
      })),
    };
  }
}
