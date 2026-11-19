import { describe, expect, test } from 'bun:test';
import { TaskPolicy, TaskRules } from 'dmg-core/testing/example';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  StartWorkStoryDef,
  ViewUserStoryDef,
} from '../../testing/example';
import {
  ExampleMenuStubAppDef,
  ExampleMenuTrimmedStubAppDef,
} from '../../testing/ui-app-fixture';
import { UiScene } from '../../testing/ui-arch';
import { UiIds } from '../address/ui-ids';
import type { AnyStoryDef } from './story-def.types';
import { StoryTree } from './story-tree';
import type { StoryBranch } from './story-tree.types';

// Дерево меню для двух составов учебного примера и для малых сцен: связи
// сторис заданы словарём «имя → куда ведёт», состав приложения — списком.

const exampleIds = new UiIds(ExampleUiSetDef);
const idOf = (story: AnyStoryDef) => exampleIds.story(story);

const full = StoryTree.of(ExampleMenuStubAppDef);
const trimmed = StoryTree.of(ExampleMenuTrimmedStubAppDef);

const sceneOf = (links: Record<string, readonly string[]>, inApp: string[]) => {
  const names = [
    ...new Set([...Object.keys(links), ...Object.values(links).flat()]),
  ];
  const made = new Map<string, AnyStoryDef>();
  const get = (name: string): AnyStoryDef => {
    const story = made.get(name);
    if (story === undefined) throw new Error(`нет сторис ${name}`);
    return story;
  };
  const screens = names.map((name) => UiScene.screen(`${name}Screen`));
  names.forEach((name, i) => {
    const screen = screens[i];
    if (screen === undefined) throw new Error('нет экрана');
    made.set(
      name,
      UiScene.story(name, [screen], {
        leads: () => (links[name] ?? []).map(get),
      }),
    );
  });
  const scene = new UiScene({
    screens,
    stories: names.map(get),
    appStories: inApp.map(get),
  });
  return StoryTree.of(scene.app);
};
const sid = (name: string) => `miniUi/todo/${name}`;
const ids = (branches: readonly StoryBranch[]) => branches.map((b) => b.id);

/** Все узлы в глубину, слева направо. */
const flatten = (branches: readonly StoryBranch[]): StoryBranch[] =>
  branches.flatMap((b) => [b, ...flatten(b.children)]);

describe('StoryTree: полный состав учебного примера', () => {
  test('единственный корень — startWork, с подсказкой, целью и текстами Def', () => {
    const [root, ...rest] = full.roots();

    expect(rest).toEqual([]);
    expect(root).toMatchObject({
      id: idOf(StartWorkStoryDef),
      name: 'startWork',
      label: 'Начать работу',
      description: 'Пользователь выбирает, с чем работать.',
      hint: 'Выберите, с чем работать: со своими задачами или с поручениями',
      goal: 'чтобы перейти к своим задачам или поручениям',
      again: false,
    });
  });

  test('дети startWork идут в порядке leads: planTasks, finishTasks, followAssigned', () => {
    const [root] = full.roots();

    expect(ids(root?.children ?? [])).toEqual([
      idOf(PlanTasksStoryDef),
      idOf(FinishTasksStoryDef),
      idOf(FollowAssignedStoryDef),
    ]);
  });

  test('у followAssigned единственный ребёнок — viewUser', () => {
    const follow = flatten(full.roots()).find(
      (b) => b.name === 'followAssigned',
    );

    expect(ids(follow?.children ?? [])).toEqual([idOf(ViewUserStoryDef)]);
  });

  test('id узлов равны id графа (UiIds набора)', () => {
    expect(ids(flatten(full.roots()))).toEqual([
      'exampleUi/todo/startWork',
      'exampleUi/todo/planTasks',
      'exampleUi/todo/finishTasks',
      'exampleUi/todo/followAssigned',
      'exampleUi/users/viewUser',
      'exampleUi/todo/planTasks',
    ]);
  });

  test('access у finishTasks — свёрнутое правило Policy домена', () => {
    const finish = flatten(full.roots()).find((b) => b.name === 'finishTasks');

    expect(finish?.access).toEqual(TaskPolicy.rules.canManage.normalize());
  });

  test('rules у planTasks — имена доменных правил сторис', () => {
    const plan = flatten(full.roots()).find((b) => b.name === 'planTasks');

    expect(plan?.rules).toEqual(PlanTasksStoryDef.normalize().rules);
    expect(plan?.rules).not.toEqual([]);
  });

  test('again: только повтор planTasks под viewUser (связь leads), остальные узлы полные; отрезанного нет', () => {
    const nodes = flatten(full.roots());

    expect(nodes.filter((b) => b.again).map((b) => b.id)).toEqual([
      'exampleUi/todo/planTasks',
    ]);
    const view = nodes.find((b) => b.name === 'viewUser');
    expect(ids(view?.children ?? [])).toEqual(['exampleUi/todo/planTasks']);
    expect(view?.children[0]?.again).toBe(true);
    expect(full.omitted()).toEqual([]);
  });
});

describe('StoryTree: урезанный состав без viewUser', () => {
  test('ветки viewUser нет', () => {
    expect(ids(flatten(trimmed.roots()))).not.toContain(idOf(ViewUserStoryDef));
    const follow = flatten(trimmed.roots()).find(
      (b) => b.name === 'followAssigned',
    );
    expect(follow?.children).toEqual([]);
  });

  test('omitted — viewUser и followAssigned, из связей которой он выпал', () => {
    expect(trimmed.omitted()).toEqual([
      { id: idOf(ViewUserStoryDef), from: idOf(FollowAssignedStoryDef) },
    ]);
  });
});

describe('StoryTree: малые сцены', () => {
  test('сторис из двух мест: первый узел полный, второй — again без children', () => {
    const tree = sceneOf(
      { root: ['a', 'b'], a: ['shared'], b: ['shared'], shared: ['leaf'] },
      ['root', 'a', 'b', 'shared', 'leaf'],
    );
    const [root] = tree.roots();
    const [a, b] = root?.children ?? [];

    expect(a?.children[0]).toMatchObject({ id: sid('shared'), again: false });
    expect(ids(a?.children[0]?.children ?? [])).toEqual([sid('leaf')]);
    expect(b?.children).toHaveLength(1);
    expect(b?.children[0]).toMatchObject({
      id: sid('shared'),
      again: true,
      children: [],
    });
  });

  test('цикл без корня: каждая сторис ровно один раз полным узлом, порядок — по app.stories', () => {
    const tree = sceneOf({ a: ['b'], b: ['c'], c: ['a'] }, ['b', 'a', 'c']);

    expect(ids(tree.roots())).toEqual([sid('b')]);
    const fullNodes = flatten(tree.roots()).filter((n) => !n.again);
    expect(ids(fullNodes)).toEqual([sid('b'), sid('c'), sid('a')]);
    expect(fullNodes.map((n) => n.again)).toEqual([false, false, false]);
  });

  test('два цикла без корня: каждый со своим поддеревом, корни — по app.stories', () => {
    const tree = sceneOf({ a: ['b'], b: ['a'], c: ['d'], d: ['c'] }, [
      'c',
      'a',
      'b',
      'd',
    ]);

    expect(ids(tree.roots())).toEqual([sid('c'), sid('a')]);
    const fullNodes = flatten(tree.roots()).filter((n) => !n.again);
    expect(ids(fullNodes).toSorted()).toEqual(
      [sid('a'), sid('b'), sid('c'), sid('d')].toSorted(),
    );
  });

  test('сторис без входящих leads, не первая в списке, — корень; порядок корней — по приложению', () => {
    const tree = sceneOf({ a: [], b: [], c: ['a'] }, ['a', 'b', 'c']);

    expect(ids(tree.roots())).toEqual([sid('b'), sid('c')]);
    expect(ids(tree.roots()[1]?.children ?? [])).toEqual([sid('a')]);
  });

  test('сторис вне app.stories: не корень, попадает в omitted с from', () => {
    const tree = sceneOf({ root: ['ghost'], ghost: ['deep'] }, ['root']);

    expect(ids(tree.roots())).toEqual([sid('root')]);
    expect(tree.roots()[0]?.children).toEqual([]);
    expect(tree.omitted()).toEqual([{ id: sid('ghost'), from: sid('root') }]);
  });

  test('самоссылка a → a: a — корень в своём месте, ребёнок — a с again и без детей', () => {
    const tree = sceneOf({ a: ['a'], b: [] }, ['a', 'b']);

    expect(ids(tree.roots())).toEqual([sid('a'), sid('b')]);
    expect(tree.roots()[0]?.children).toHaveLength(1);
    expect(tree.roots()[0]?.children[0]).toMatchObject({
      id: sid('a'),
      again: true,
      children: [],
    });
  });

  test('сторис вне приложения из двух мест: в omitted одна запись с первым from', () => {
    const tree = sceneOf({ root: ['ghost', 'b'], b: ['ghost'] }, ['root', 'b']);

    expect(tree.omitted()).toEqual([{ id: sid('ghost'), from: sid('root') }]);
  });

  test('приложение без сторис: корней и отрезанного нет', () => {
    const tree = sceneOf({}, []);

    expect(tree.roots()).toEqual([]);
    expect(tree.omitted()).toEqual([]);
  });
});

describe('StoryTree: необязательные ключи и форма', () => {
  test('без access и hint в Def — ключей в узле нет', () => {
    const [root] = sceneOf({ plain: [] }, ['plain']).roots();

    expect(root).not.toHaveProperty('access');
    expect(root).not.toHaveProperty('hint');
    expect(root?.rules).toEqual([]);
  });

  test('access и rules берутся из Def сторис', () => {
    const screen = UiScene.screen('s');
    const story = UiScene.story('guarded', [screen], {
      access: TaskPolicy.rules.canManage,
      rules: [TaskRules.rules.withinOpenLimit],
      hint: 'Подсказка',
    });
    const scene = new UiScene({ screens: [screen], stories: [story] });

    const [root] = StoryTree.of(scene.app).roots();

    expect(root?.access).toEqual(TaskPolicy.rules.canManage.normalize());
    expect(root?.rules).toEqual(story.normalize().rules);
    expect(root?.hint).toBe('Подсказка');
  });

  test('of принимает одно приложение: субъекта у дерева нет', () => {
    expect(StoryTree.of.length).toBe(1);
  });

  test('дерево JSON-безопасно: круг через JSON даёт тот же объект', () => {
    const roots = full.roots();

    expect(JSON.parse(JSON.stringify(roots))).toStrictEqual(roots);
  });
});
