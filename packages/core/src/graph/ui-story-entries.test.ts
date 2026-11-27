import { describe, expect, test } from 'bun:test';
import { AppGraph, DomainIds } from 'dmg-core/graph';
import { ExampleAppDef, TaskEvents } from 'dmg-core/testing/example';
import {
  AssignedTasksScreenDef,
  CheckProfileStoryDef,
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  PlanTasksStoryDef,
  ProfileSummaryScreenDef,
  StartWorkStoryDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  UserCardScreenDef,
  ViewUserStoryDef,
} from 'dmg-ui/example';
import { ExampleStubUiAppDef } from '../../testing/ui-app.fixture';
import { UiScene } from '../../testing/ui-arch';
import { Address } from '../address/address';
import { UiIds } from '../address/ui-ids';
import type { AnyScreenDef } from '../manifest/screen-def';
import type { AnyStoryDef } from '../manifest/story-def.types';
import { UiAppDef } from '../manifest/ui-app-def';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import { UiGraphProvider } from './ui-graph-provider';
import type { UiStartsFromProps } from './ui-props.types';
import { UiStoryEntries } from './ui-story-entries';

// Входы сторис (`startsFrom`) считаются по Def набора и приложений UI (Р-2).
// Учебный набор даёт entry, notification, action и общий экран `TaskList`;
// redirect, вход не в `start`, дедуп и порядок — мини-сцены `UiScene`.

const exampleIds = new UiIds(ExampleUiSetDef);
const domain = new DomainIds(ExampleAppDef);
const exampleEntries = new UiStoryEntries(
  ExampleUiSetDef,
  [ExampleStubUiAppDef],
  exampleIds,
);

const viaEntry = (
  ids: UiIds,
  app: AnyUiAppDef,
  name: string,
  screen: AnyScreenDef,
): UiStartsFromProps => ({
  via: 'entry',
  from: ids.app(app),
  screen: ids.screen(screen),
  name,
});

const viaAction = (
  ids: UiIds,
  owner: AnyScreenDef,
  action: string,
  screen: AnyScreenDef,
): UiStartsFromProps => ({
  via: 'action',
  from: ids.action(owner, action),
  screen: ids.screen(screen),
});

const viaRedirect = (
  ids: UiIds,
  story: AnyStoryDef,
  screen: AnyScreenDef,
): UiStartsFromProps => ({
  via: 'redirect',
  from: ids.story(story),
  screen: ids.screen(screen),
});

const example = {
  entry: (name: string, screen: AnyScreenDef) =>
    viaEntry(exampleIds, ExampleStubUiAppDef, name, screen),
  action: (owner: AnyScreenDef, action: string, screen: AnyScreenDef) =>
    viaAction(exampleIds, owner, action, screen),
};

describe('UiStoryEntries: учебный набор', () => {
  test('planTasks: вход приложения и действия других экранов, включая TaskCard/back в общий TaskList', () => {
    expect(exampleEntries.of(PlanTasksStoryDef)).toEqual([
      example.entry('start', TaskListScreenDef),
      example.action(MainMenuScreenDef, 'tasks', TaskListScreenDef),
      example.action(TaskCardScreenDef, 'back', TaskListScreenDef),
      example.action(UserCardScreenDef, 'tasks', TaskListScreenDef),
    ]);
  });

  test('finishTasks: TaskCard/back и TaskList/open — внутренние переходы, не входы', () => {
    expect(exampleEntries.of(FinishTasksStoryDef)).toEqual([
      example.entry('start', TaskListScreenDef),
      example.action(MainMenuScreenDef, 'tasks', TaskListScreenDef),
      example.action(UserCardScreenDef, 'tasks', TaskListScreenDef),
    ]);
  });

  test('followAssigned: вход приложения, оба уведомления с событием как у notifiedBy и действие меню', () => {
    const assigned = exampleIds.notification(TaskAssignedNotificationDef);
    const completed = exampleIds.notification(TaskCompletedNotificationDef);

    expect(exampleEntries.of(FollowAssignedStoryDef)).toEqual([
      example.entry('assigned', AssignedTasksScreenDef),
      {
        via: 'notification',
        from: assigned,
        screen: exampleIds.screen(AssignedTasksScreenDef),
        event: domain.event(TaskEvents.assigned),
      },
      {
        via: 'notification',
        from: completed,
        screen: exampleIds.screen(AssignedTasksScreenDef),
        event: domain.event(TaskEvents.completed),
      },
      example.action(MainMenuScreenDef, 'assigned', AssignedTasksScreenDef),
    ]);
  });

  test('startWork: корень без входящих переходов — пустой список', () => {
    expect(exampleEntries.of(StartWorkStoryDef)).toEqual([]);
  });

  test('viewUser: действия двух экранов чужих сторис, порядок по from', () => {
    expect(exampleEntries.of(ViewUserStoryDef)).toEqual([
      example.action(ProfileSummaryScreenDef, 'card', UserCardScreenDef),
      example.action(AssignedTasksScreenDef, 'openAssignee', UserCardScreenDef),
    ]);
  });

  test('checkProfile: действие меню на ProfileSummary', () => {
    expect(exampleEntries.of(CheckProfileStoryDef)).toEqual([
      example.action(MainMenuScreenDef, 'profile', ProfileSummaryScreenDef),
    ]);
  });
});

describe('UiStoryEntries: мини-сцены', () => {
  test('redirect: исход T в экран S — запись у S, у T её нет; back и home входов не дают', () => {
    const a = UiScene.screen('a');
    const b = UiScene.exiting('b');
    const c = UiScene.exiting('c');
    const s = UiScene.story('s', [a]);
    const t = UiScene.story('t', [b], {
      outcomes: { done: UiScene.outcome(b, new Address(a, {})) },
    });
    const u = UiScene.story('u', [c], {
      outcomes: { done: UiScene.outcome(c, 'home') },
    });
    const scene = new UiScene({
      screens: [a, b, c],
      stories: [s, t, u],
      entries: {},
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);

    expect(entries.of(s)).toEqual([viaRedirect(ids, t, a)]);
    expect(entries.of(t)).toEqual([]);
    expect(entries.of(u)).toEqual([]);
  });

  test('исход в свой экран — не вход', () => {
    const a = UiScene.exiting('a');
    const s = UiScene.story('s', [a], {
      outcomes: { done: UiScene.outcome(a, new Address(a, {})) },
    });
    const scene = new UiScene({ screens: [a], stories: [s], entries: {} });
    const entries = new UiStoryEntries(
      scene.set,
      [scene.app],
      new UiIds(scene.set),
    );

    expect(entries.of(s)).toEqual([]);
  });

  test('общий экран и исход в него: у обеих сторис записи redirect нет', () => {
    const a = UiScene.exiting('a');
    const b = UiScene.screen('b');
    const s1 = UiScene.story('s1', [a], {
      outcomes: { done: UiScene.outcome(a, new Address(a, {})) },
    });
    const s2 = UiScene.story('s2', [a, b], {
      outcomes: { done: UiScene.outcome(a, new Address(a, {})) },
    });
    const scene = new UiScene({
      screens: [a, b],
      stories: [s1, s2],
      entries: {},
    });
    const entries = new UiStoryEntries(
      scene.set,
      [scene.app],
      new UiIds(scene.set),
    );

    expect(entries.of(s1)).toEqual([]);
    expect(entries.of(s2)).toEqual([]);
  });

  test('вход не в start: вход приложения и уведомление ведут на второй экран сторис', () => {
    const a = UiScene.screen('a');
    const b = UiScene.screen('b');
    const s = UiScene.story('s', [a, b]);
    const n = UiScene.notification('n', { links: () => [b] });
    const scene = new UiScene({
      screens: [a, b],
      stories: [s],
      notifications: [n],
      entries: { deep: UiScene.entry(b) },
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);

    expect(entries.of(s)).toEqual([
      viaEntry(ids, scene.app, 'deep', b),
      {
        via: 'notification',
        from: ids.notification(n),
        screen: ids.screen(b),
        event: domain.event(TaskEvents.assigned),
      },
    ]);
  });

  test('переход между экранами одной сторис — не вход, а переход снаружи на её не-start экран — вход', () => {
    const a = UiScene.screen('a');
    const b = UiScene.screen('b');
    const x = UiScene.screen('x', { actions: { go: UiScene.jump(b) } });
    const a2 = UiScene.screen('a2', { actions: { next: UiScene.jump(b) } });
    const s = UiScene.story('s', [a, a2, b]);
    const o = UiScene.story('o', [x]);
    const scene = new UiScene({
      screens: [a, a2, b, x],
      stories: [s, o],
      entries: {},
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);

    expect(entries.of(s)).toEqual([viaAction(ids, x, 'go', b)]);
  });

  test('дедуп: два исхода T в один экран S и повтор в links() дают по одной записи', () => {
    const a = UiScene.screen('a');
    const b = UiScene.screen('b', {
      exits: {
        done: { label: 'Готово', description: 'Работа окончена.' },
        other: { label: 'Иначе', description: 'Другой исход.' },
      },
    });
    const s = UiScene.story('s', [a]);
    const t = UiScene.story('t', [b], {
      outcomes: {
        done: UiScene.outcome(b, new Address(a, {})),
        other: {
          label: 'Иначе',
          description: 'Другой исход.',
          exits: [UiScene.exit(b, 'other')],
          after: new Address(a, {}),
        },
      },
    });
    const n = UiScene.notification('n', { links: () => [a, a] });
    const scene = new UiScene({
      screens: [a, b],
      stories: [s, t],
      notifications: [n],
      entries: {},
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);

    expect(entries.of(s)).toEqual([
      {
        via: 'notification',
        from: ids.notification(n),
        screen: ids.screen(a),
        event: domain.event(TaskEvents.assigned),
      },
      viaRedirect(ids, t, a),
    ]);
  });

  test('экран вне набора: вход, уведомление, действие и исход на него записей не дают', () => {
    const outside = UiScene.screen('outside');
    const a = UiScene.screen('a');
    const x = UiScene.screen('x', {
      actions: { go: UiScene.jump(outside), back: UiScene.jump(a) },
    });
    const r = UiScene.exiting('r');
    const s = UiScene.story('s', [a, outside]);
    const o = UiScene.story('o', [x]);
    const t = UiScene.story('t', [r], {
      outcomes: { done: UiScene.outcome(r, new Address(outside, {})) },
    });
    const n = UiScene.notification('n', { links: () => [outside] });
    const scene = new UiScene({
      screens: [a, x, r],
      stories: [s, o, t],
      notifications: [n],
      entries: { deep: UiScene.entry(outside) },
    });
    const ids = new UiIds(scene.set);
    const found = new UiStoryEntries(scene.set, [scene.app], ids).of(s);

    expect(found).toEqual([viaAction(ids, x, 'back', a)]);
    expect(JSON.stringify(found)).not.toContain('dmg-ui/orphan');
  });

  test('дедуп entry: два входа на один экран с разными name — две записи, порядок по name', () => {
    const a = UiScene.screen('a');
    const s = UiScene.story('s', [a]);
    const scene = new UiScene({
      screens: [a],
      stories: [s],
      entries: { zeta: UiScene.entry(a), alpha: UiScene.entry(a) },
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);

    expect(entries.of(s)).toEqual([
      viaEntry(ids, scene.app, 'alpha', a),
      viaEntry(ids, scene.app, 'zeta', a),
    ]);
  });

  /**
   * Сцена с входами всех видов, объявленными «неудобно»: порядок записи — по
   * виду, затем по `from` и экрану, а не по порядку Def (Р-5).
   */
  const ordered = (reverse: boolean) => {
    const maybe = <T>(items: T[]): T[] =>
      reverse ? items.toReversed() : items;
    const a = UiScene.screen('a');
    const b = UiScene.screen('b');
    const x = UiScene.screen('x', { actions: { go: UiScene.jump(b, a) } });
    const y = UiScene.screen('y', { actions: { go: UiScene.jump(a) } });
    const r1 = UiScene.exiting('r1');
    const r2 = UiScene.exiting('r2');
    const s = UiScene.story('s', [b, a]);
    const t1 = UiScene.story('t1', [r1], {
      outcomes: { done: UiScene.outcome(r1, new Address(a, {})) },
    });
    const t2 = UiScene.story('t2', [r2], {
      outcomes: { done: UiScene.outcome(r2, new Address(a, {})) },
    });
    const other = UiScene.story('other', [x, y]);
    const n1 = UiScene.notification('n1', { links: () => [b] });
    const n2 = UiScene.notification('n2', { links: () => [a] });
    const scene = new UiScene({
      screens: maybe([b, a, y, x, r2, r1]),
      stories: maybe([t2, s, other, t1]),
      notifications: maybe([n2, n1]),
      entries: Object.fromEntries(
        maybe([
          ['z', UiScene.entry(a)],
          ['m', UiScene.entry(b)],
        ] as const),
      ),
    });
    const ids = new UiIds(scene.set);
    const entries = new UiStoryEntries(scene.set, [scene.app], ids);
    return { entries: entries.of(s), ids, scene, a, b, x, y, n1, n2, t1, t2 };
  };

  test('порядок: вид, затем from и screen; не зависит от порядка объявления Def', () => {
    const direct = ordered(false);
    const reversed = ordered(true);
    const { ids, scene, a, b, x, y, n1, n2, t1, t2 } = direct;
    const note = (n: typeof n1, screen: AnyScreenDef): UiStartsFromProps => ({
      via: 'notification',
      from: ids.notification(n),
      screen: ids.screen(screen),
      event: domain.event(TaskEvents.assigned),
    });

    expect(direct.entries).toEqual([
      viaEntry(ids, scene.app, 'z', a),
      viaEntry(ids, scene.app, 'm', b),
      note(n1, b),
      note(n2, a),
      viaAction(ids, x, 'go', a),
      viaAction(ids, x, 'go', b),
      viaAction(ids, y, 'go', a),
      viaRedirect(ids, t1, a),
      viaRedirect(ids, t2, a),
    ]);
    expect(reversed.entries).toEqual(direct.entries);
  });

  test('несколько приложений UI: входы каждого приложения попадают в props узла сторис', () => {
    const a = UiScene.screen('a');
    const b = UiScene.screen('b');
    const s = UiScene.story('s', [a, b]);
    const scene = new UiScene({
      screens: [a, b],
      stories: [s],
      entries: { start: UiScene.entry(a) },
    });
    const second = UiAppDef.define({
      name: 'secondConsole',
      label: 'Второе приложение',
      description: 'Второе приложение UI той же сцены.',
      set: scene.set,
      channel: 'second-channel',
      stories: [s],
      notifications: [],
      entries: { open: UiScene.entry(b) },
    });
    const ids = new UiIds(scene.set);
    const provider = new UiGraphProvider({
      set: scene.set,
      apps: [scene.app, second],
      channels: [],
    });
    const graph = new AppGraph({
      def: ExampleAppDef,
      providers: [provider],
    }).build();

    expect(graph.node(ids.story(s))?.props).toMatchObject({
      startsFrom: [
        viaEntry(ids, scene.app, 'start', a),
        viaEntry(ids, second, 'open', b),
      ],
    });
  });
});
