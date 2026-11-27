import { toJsonSchema } from 'dmg-core';
import type { GraphNodeInput } from 'dmg-core/graph';
import type { UiIds } from '../address/ui-ids';
import type {
  AnyNotificationDef,
  RecipientsSpec,
} from '../manifest/notification-def.types';
import type { ScreenAction } from '../manifest/screen-action';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { ScreenExit } from '../manifest/screen-exit';
import type { ScreenLocal } from '../manifest/screen-local';
import type { AnyStoryDef, OutcomeSpec } from '../manifest/story-def.types';
import { StoryTree } from '../manifest/story-tree';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiModuleDef } from '../manifest/ui-module-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { UI_NODE_KINDS } from './ui-kinds';
import type {
  UiActionProps,
  UiAppProps,
  UiExitProps,
  UiLocalProps,
  UiModuleProps,
  UiNotificationProps,
  UiOutcomeAfterProps,
  UiRecipientsProps,
  UiScreenProps,
  UiSetProps,
  UiStoryProps,
} from './ui-props.types';
import { UiSections } from './ui-sections';
import { UiStoryEntries } from './ui-story-entries';

/**
 * Узлы графа по Def набора UI и приложений UI. `id` — только через `UiIds`;
 * порядок ключей `props` фиксирован, ключ без значения не пишется.
 */
export class UiNodes {
  private readonly sections: UiSections;
  private readonly entries: UiStoryEntries;

  constructor(
    private readonly set: AnyUiSetDef,
    private readonly apps: readonly AnyUiAppDef[],
    private readonly ids: UiIds,
  ) {
    this.sections = UiSections.ofSet(set, ids);
    this.entries = new UiStoryEntries(set, apps, ids);
  }

  list(): GraphNodeInput[] {
    const nodes: GraphNodeInput[] = [this.setNode()];
    for (const module of this.set.modules) {
      nodes.push(this.moduleNode(module));
      for (const screen of module.screens) {
        nodes.push(this.screenNode(screen), ...this.actionNodes(screen));
      }
      for (const story of module.stories) nodes.push(this.storyNode(story));
      for (const notification of module.notifications ?? []) {
        nodes.push(this.notificationNode(notification));
      }
    }
    for (const app of this.apps) nodes.push(this.appNode(app));
    return nodes;
  }

  private setNode(): GraphNodeInput {
    const props: UiSetProps = { app: this.set.app.name };
    return {
      kind: UI_NODE_KINDS.set,
      id: this.ids.set(),
      label: this.set.label,
      description: this.set.description,
      visible: this.set.visible,
      props,
    };
  }

  private moduleNode(module: AnyUiModuleDef): GraphNodeInput {
    const id = this.ids.module(module);
    const props: UiModuleProps = { section: this.sections.section(id) };
    return {
      kind: UI_NODE_KINDS.module,
      id,
      label: module.label,
      description: module.description,
      visible: module.visible,
      props,
    };
  }

  private storyNode(story: AnyStoryDef): GraphNodeInput {
    const props: UiStoryProps = {
      ...(story.hint === undefined ? {} : { hint: story.hint }),
      callers: story.callers,
      goal: story.goal,
      start: this.ids.target(story.start),
      outcomes: Object.entries(story.outcomes).map(([name, outcome]) => ({
        name,
        label: outcome.label,
        description: outcome.description,
        exits: outcome.exits.map((exit) => ({
          screen: this.ids.target(exit.screen),
          exit: exit.name,
        })),
        after: this.afterOf(outcome),
      })),
      startsFrom: this.entries.of(story),
      ...(story.access === undefined
        ? {}
        : { access: story.access.normalize() }),
    };
    return {
      kind: UI_NODE_KINDS.story,
      id: this.ids.story(story),
      label: story.label,
      description: story.description,
      visible: story.visible,
      props,
    };
  }

  private screenNode(screen: AnyScreenDef): GraphNodeInput {
    const props: UiScreenProps = {
      ...(screen.hint === undefined ? {} : { hint: screen.hint }),
      params: toJsonSchema(screen.params),
      ...(screen.state === undefined
        ? {}
        : { state: toJsonSchema(screen.state) }),
      ...(screen.primary === undefined ? {} : { primary: screen.primary }),
      locals: Object.values<ScreenLocal>(screen.locals).map((local) =>
        UiNodes.localProps(local),
      ),
      exits: Object.values<ScreenExit>(screen.exits).map((exit) =>
        UiNodes.exitProps(exit),
      ),
      examples: Object.keys(screen.examples),
    };
    return {
      kind: UI_NODE_KINDS.screen,
      id: this.ids.screen(screen),
      label: screen.label,
      description: screen.description,
      visible: screen.visible,
      props,
    };
  }

  private actionNodes(screen: AnyScreenDef): GraphNodeInput[] {
    return Object.values<ScreenAction>(screen.actions).map((action) => {
      const props: UiActionProps = {
        ...(action.hint === undefined ? {} : { hint: action.hint }),
        ...(action.input === undefined
          ? {}
          : { input: toJsonSchema(action.input) }),
        ...(action.confirm === undefined ? {} : { confirm: action.confirm }),
        ...(action.row === undefined ? {} : { row: action.row }),
      };
      return {
        kind: UI_NODE_KINDS.action,
        id: this.ids.action(screen, action.name),
        label: action.label,
        description: action.description,
        visible: action.visible,
        props,
      };
    });
  }

  private notificationNode(notification: AnyNotificationDef): GraphNodeInput {
    const props: UiNotificationProps = {
      recipients: UiNodes.recipientsOf(notification.recipients),
      examples: Object.keys(notification.examples),
    };
    return {
      kind: UI_NODE_KINDS.notification,
      id: this.ids.notification(notification),
      label: notification.label,
      description: notification.description,
      visible: notification.visible,
      props,
    };
  }

  private appNode(app: AnyUiAppDef): GraphNodeInput {
    const props: UiAppProps = {
      set: this.ids.set(),
      channel: app.channel,
      roots: StoryTree.of(app)
        .roots()
        .map((branch) => branch.id),
      entries: Object.entries(app.entries).map(([name, entry]) => ({
        name,
        label: entry.label,
        description: entry.description,
        screen: this.ids.target(entry.address.screen),
        params: entry.address.params,
      })),
    };
    return {
      kind: UI_NODE_KINDS.app,
      id: this.ids.app(app),
      label: app.label,
      description: app.description,
      visible: app.visible,
      props,
    };
  }

  /** Цель исхода: адрес — `id` экрана (вне набора — внешний конец) и параметры. */
  private afterOf(outcome: OutcomeSpec): UiOutcomeAfterProps {
    const after = outcome.after ?? 'back';
    if (after === 'back' || after === 'home') return after;
    return { screen: this.ids.target(after.screen), params: after.params };
  }

  private static localProps(local: ScreenLocal): UiLocalProps {
    return {
      name: local.name,
      label: local.label,
      description: local.description,
      ...(local.hint === undefined ? {} : { hint: local.hint }),
      ...(local.input === undefined
        ? {}
        : { input: toJsonSchema(local.input) }),
    };
  }

  private static exitProps(exit: ScreenExit): UiExitProps {
    return {
      name: exit.name,
      label: exit.label,
      description: exit.description,
      ...(exit.data === undefined ? {} : { data: toJsonSchema(exit.data) }),
    };
  }

  /** UC получателей уходит в ребро `recipients`, в свойствах — вход и поля. */
  private static recipientsOf(recipients: RecipientsSpec): UiRecipientsProps {
    if (recipients.from === 'payload') return recipients;
    const { from, input, fields } = recipients;
    return { from, input, fields };
  }
}
