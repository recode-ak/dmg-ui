import type { GraphNode } from 'dmg-core/graph';
import type * as v from 'valibot';
import type { EVENT_VIEW, UC_VIEW } from './ui-domain-props';
import type { UI_PROPS } from './ui-props';

/** Узел графа и его свойства, разобранные схемой вида. */
export type UiEntry<P> = {
  readonly node: GraphNode;
  readonly props: P;
};

export type SetView = v.InferOutput<typeof UI_PROPS.uiSet>;
export type StoryView = v.InferOutput<typeof UI_PROPS.story>;
export type ScreenView = v.InferOutput<typeof UI_PROPS.screen>;
export type ActionView = v.InferOutput<typeof UI_PROPS.action>;
export type NotificationView = v.InferOutput<typeof UI_PROPS.notification>;
export type AppView = v.InferOutput<typeof UI_PROPS.uiApp>;
export type RefreshedByView = v.InferOutput<typeof UI_PROPS.refreshedBy>;
export type UcView = v.InferOutput<typeof UC_VIEW>;
export type EventView = v.InferOutput<typeof EVENT_VIEW>;
