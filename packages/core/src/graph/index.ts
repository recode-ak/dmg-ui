// Вход `dmg-ui/graph`: поставщик графа ядра UI и его виды. Отдельно от корня:
// код экрана и исполнитель не тянут `dmg-core/graph`.

export { UiGraphProvider } from './ui-graph-provider';
export type {
  UiChannelSpec,
  UiGraphSpec,
} from './ui-graph-provider.types';
export {
  UI_EDGE_KINDS,
  UI_KINDS,
  UI_NODE_KINDS,
  UI_PROVIDER,
  UI_RULE_PREFIX,
  UI_VERSION,
} from './ui-kinds';
export type * from './ui-props.types';
