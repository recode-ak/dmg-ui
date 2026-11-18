import { describe, expect, test } from 'bun:test';
import { UiAppDef } from 'dmg-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { ArchReport, UiScene } from 'dmg-ui/testing/fixtures';
import { ExamplePagesAppDef, examplePageViews } from '../../testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageRouteDef } from '../url/page-route-def';
import { PageGraphProvider } from './page-graph-provider';

// Правила страничного канала: PG-01 «маршрут ведёт на вход приложения UI» и
// PG-02 «у входа приложения есть маршрут». Оба читают только рёбра графа.

const route = (name: string, path: string, entry: string) =>
  PageRouteDef.define({
    name,
    label: `Маршрут ${name}`,
    description: `Описание маршрута ${name}.`,
    path,
    entry,
  });

const TASKS = route('tasks', '/', 'start');
const ASSIGNED = route('assigned', '/assigned', 'assigned');

const reportOf = (routes: readonly PageRouteDef[]) =>
  ArchReport.of(
    UiScene.appOf(
      ExampleUiSetDef,
      [ExamplePagesAppDef],
      [
        new PageGraphProvider({
          apps: [{ app: ExamplePagesAppDef, views: examplePageViews, routes }],
        }),
      ],
    ),
  );

describe('PG-01: маршрут ведёт на вход приложения UI', () => {
  test('маршрут на необъявленный вход — код 1 и строка PG-01', () => {
    const report = reportOf([
      TASKS,
      ASSIGNED,
      route('ghost', '/ghost', 'nowhere'),
    ]);

    expect(report.code).toBe(1);
    expect(report.rule('PG-01')).toEqual([
      'PG-01: маршрут examplePages/ghost: вход nowhere не объявлен приложением',
    ]);
    expect(report.rule('PG-02')).toEqual([]);
  });

  test('оба маршрута на объявленные входы — PG-01 молчит', () => {
    expect(reportOf([TASKS, ASSIGNED]).rule('PG-01')).toEqual([]);
  });
});

describe('PG-02: у входа приложения есть маршрут', () => {
  test('вход assigned без маршрута — код 1 и строка PG-02 с экраном входа', () => {
    const report = reportOf([TASKS]);
    const lines = report.rule('PG-02');

    expect(report.code).toBe(1);
    expect(lines).toEqual([
      'PG-02: вход приложения examplePages: экран exampleUi/todo/assignedTasks не открыт ни одним маршрутом',
    ]);
    expect(report.rule('PG-01')).toEqual([]);
  });

  test('нет ни одного маршрута — PG-02 на каждый из двух входов', () => {
    const report = reportOf([]);

    expect(report.code).toBe(1);
    expect(report.rule('PG-02')).toHaveLength(2);
  });

  test('два маршрута на один вход — PG-02 молчит', () => {
    const report = reportOf([
      TASKS,
      ASSIGNED,
      route('again', '/again', 'start'),
    ]);

    expect(report.rule('PG-02')).toEqual([]);
  });
});

describe('PG-01 и PG-02: чистая сцена', () => {
  test('маршруты на оба входа — код 0, правил PG в отчёте нет', () => {
    const report = reportOf([TASKS, ASSIGNED]);

    expect(report.code).toBe(0);
    expect(report.rule('PG-01')).toEqual([]);
    expect(report.rule('PG-02')).toEqual([]);
  });
});

describe('PG-02: два приложения в одном поставщике', () => {
  const SecondPagesAppDef = UiAppDef.define({
    name: 'secondPages',
    label: 'Второе приложение',
    description: 'Второе приложение учебного набора.',
    set: ExampleUiSetDef,
    channel: PAGE_CHANNEL,
    stories: [],
    entries: ExamplePagesAppDef.entries,
  });

  const twoApps = (second: readonly PageRouteDef[]) =>
    ArchReport.of(
      UiScene.appOf(
        ExampleUiSetDef,
        [ExamplePagesAppDef, SecondPagesAppDef],
        [
          new PageGraphProvider({
            apps: [
              {
                app: ExamplePagesAppDef,
                views: examplePageViews,
                routes: [TASKS, ASSIGNED],
              },
              {
                app: SecondPagesAppDef,
                views: examplePageViews,
                routes: second,
              },
            ],
          }),
        ],
      ),
    );

  test('у второго приложения вход assigned без маршрута — строка с его именем, у первого её нет', () => {
    const report = twoApps([TASKS]);

    expect(report.code).toBe(1);
    expect(report.rule('PG-02')).toEqual([
      'PG-02: вход приложения secondPages: экран exampleUi/todo/assignedTasks не открыт ни одним маршрутом',
    ]);
  });

  test('оба приложения с маршрутами на все входы — PG-02 молчит', () => {
    expect(twoApps([TASKS, ASSIGNED]).rule('PG-02')).toEqual([]);
  });
});
