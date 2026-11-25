import { describe, expect, test } from 'bun:test';
import { AppGraph } from 'dmg-core/graph';
import { ExampleAppDef } from 'dmg-core/testing';
import { ExampleUiSetDef } from 'dmg-ui/example';
import { UiScene, UiSetScene } from '../../testing/ui-arch';
import { UiIds } from '../address/ui-ids';
import type { StoryDef } from '../manifest/story-def';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { UiGraphProvider } from './ui-graph-provider';
import { UiGraphReader } from './ui-graph-reader';
import { UiSections } from './ui-sections';

// Каждая сцена считается обоими входами: по Def набора (`ofSet`, его берёт
// `UiNodes`) и по графу (`ofGraph`, его берёт UI-37) — алгоритм один.

const TASKS = 'miniUi/tasks';
const PEOPLE = 'miniUi/people';
const REPORTS = 'miniUi/reports';

/** Вид модуля и его источники. */
type Verdict = {
  readonly section: boolean;
  readonly sources: readonly string[];
};

const graphOf = (set: AnyUiSetDef) =>
  new AppGraph({
    def: ExampleAppDef,
    providers: [new UiGraphProvider({ set, apps: [], channels: [] })],
  }).build();

/** Вид модуля по Def набора и по графу — в этом порядке. */
const verdicts = (set: AnyUiSetDef, module: string): Verdict[] =>
  [
    UiSections.ofSet(set, new UiIds(set)),
    UiSections.ofGraph(new UiGraphReader(graphOf(set))),
  ].map((sections) => ({
    section: sections.section(module),
    sources: sections.sources(module),
  }));

/** Оба входа дают один вид. */
const both = (verdict: Verdict): Verdict[] => [verdict, verdict];

const screen = UiScene.screen;
const story = UiScene.story;

describe('UiSections — раздел и вспомогательный модуль по связям сторис', () => {
  test('S-01 модуль со сторис, в которую не ведёт другой модуль, — раздел', () => {
    // В plan ведёт people (card не корневая), в list — никто.
    const plan = story('plan', [screen('planned')]);
    const list = story('list', [screen('rows')]);
    const card = story('card', [screen('person')], { leads: () => [plan] });
    const menu = story('menu', [screen('hub')], { leads: () => [card] });
    const scene = new UiSetScene({
      modules: {
        tasks: {
          screens: [...plan.screens, ...list.screens],
          stories: [plan, list],
        },
        people: {
          screens: [...card.screens, ...menu.screens],
          stories: [card, menu],
        },
      },
    });

    expect(verdicts(scene.set, TASKS).map((v) => v.section)).toEqual([
      true,
      true,
    ]);
  });

  test('S-02 в каждую сторис модуля ведёт другой модуль — вспомогательный; источники — модули сторис-источников без повторов', () => {
    const card = story('card', [screen('person')]);
    const badge = story('badge', [screen('mark')]);
    const plan = story('plan', [screen('planned')], {
      leads: () => [card, badge],
    });
    const digest = story('digest', [screen('totals')], {
      leads: () => [card],
    });
    const menu = story('menu', [screen('hub')], {
      leads: () => [plan, digest],
    });
    const scene = new UiSetScene({
      modules: {
        tasks: {
          screens: [...menu.screens, ...plan.screens],
          stories: [menu, plan],
        },
        reports: { screens: [...digest.screens], stories: [digest] },
        people: {
          screens: [...card.screens, ...badge.screens],
          stories: [card, badge],
        },
      },
    });

    // Порядок источников — порядок графа (по id), а не набора.
    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: false, sources: [REPORTS, TASKS] }),
    );
  });

  test('S-03 связь из корневой сторис набора не в счёт: модуль, открытый только из меню, — раздел', () => {
    const card = story('card', [screen('person')]);
    const menu = story('menu', [screen('hub')], { leads: () => [card] });
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [...menu.screens], stories: [menu] },
        people: { screens: [...card.screens], stories: [card] },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: true, sources: [] }),
    );
  });

  test('S-04 корневая сторис и ещё один модуль ведут в единственную сторис модуля — вспомогательный с одним источником', () => {
    const card = story('card', [screen('person')]);
    const digest = story('digest', [screen('totals')], {
      leads: () => [card],
    });
    const menu = story('menu', [screen('hub')], {
      leads: () => [digest, card],
    });
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [...menu.screens], stories: [menu] },
        reports: { screens: [...digest.screens], stories: [digest] },
        people: { screens: [...card.screens], stories: [card] },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: false, sources: [REPORTS] }),
    );
  });

  test('S-05 вход из своей сторис не делает модуль разделом и не идёт в источники', () => {
    // В card ведёт reports, в edit — только card своего модуля.
    const edit = story('edit', [screen('form')]);
    const card = story('card', [screen('person')], { leads: () => [edit] });
    const digest = story('digest', [screen('totals')], {
      leads: () => [card],
    });
    const menu = story('menu', [screen('hub')], { leads: () => [digest] });
    const scene = new UiSetScene({
      modules: {
        reports: {
          screens: [...menu.screens, ...digest.screens],
          stories: [menu, digest],
        },
        people: {
          screens: [...card.screens, ...edit.screens],
          stories: [card, edit],
        },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: false, sources: [REPORTS] }),
    );
  });

  test('S-06 модуль без сторис — вспомогательный без источников', () => {
    const menu = story('menu', [screen('hub')]);
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [...menu.screens], stories: [menu] },
        people: { screens: [screen('person')] },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: false, sources: [] }),
    );
  });

  test('S-07 связь на сторис вне набора не в счёт', () => {
    // stray — вне набора; её связь в card набор не видит, ссылку на неё
    // называет UI-22.
    const card = story('card', [screen('person')]);
    const stray = story('stray', [screen('lost')], { leads: () => [card] });
    const plan = story('plan', [screen('planned')], {
      leads: () => [stray],
    });
    const menu = story('menu', [screen('hub')], { leads: () => [plan] });
    const scene = new UiSetScene({
      modules: {
        tasks: {
          screens: [...menu.screens, ...plan.screens],
          stories: [menu, plan],
        },
        people: { screens: [...card.screens], stories: [card] },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: true, sources: [] }),
    );
    expect(verdicts(scene.set, TASKS)).toEqual(
      both({ section: true, sources: [] }),
    );
  });

  test('S-09 цикл своих сторис без внешнего входа — вспомогательный без источников', () => {
    // Недостижимость такого модуля называет UI-07.
    const edit: StoryDef = story('edit', [screen('form')], {
      leads: () => [card],
    });
    const card = story('card', [screen('person')], { leads: () => [edit] });
    const menu = story('menu', [screen('hub')]);
    const scene = new UiSetScene({
      modules: {
        tasks: { screens: [...menu.screens], stories: [menu] },
        people: {
          screens: [...card.screens, ...edit.screens],
          stories: [card, edit],
        },
      },
    });

    expect(verdicts(scene.set, PEOPLE)).toEqual(
      both({ section: false, sources: [] }),
    );
  });

  test('S-08 ofSet и ofGraph на учебном наборе дают одно и то же', () => {
    const ids = ExampleUiSetDef.modules.map(
      (module) => `${ExampleUiSetDef.name}/${module.name}`,
    );
    const fromSet = UiSections.ofSet(
      ExampleUiSetDef,
      new UiIds(ExampleUiSetDef),
    );
    const fromGraph = UiSections.ofGraph(
      new UiGraphReader(graphOf(ExampleUiSetDef)),
    );
    const of = (sections: UiSections) =>
      ids.map((id) => ({
        id,
        section: sections.section(id),
        sources: sections.sources(id),
      }));

    expect(of(fromGraph)).toEqual(of(fromSet));
    // Не вхолостую: в наборе есть и раздел, и вспомогательный с источниками.
    expect(of(fromSet).map((v) => v.section)).toEqual(
      expect.arrayContaining([true, false]),
    );
    expect(of(fromSet).some((v) => !v.section && v.sources.length > 1)).toBe(
      true,
    );
  });
});
