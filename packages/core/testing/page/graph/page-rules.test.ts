import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from '../../example';
import { ExamplePagesAppDef, examplePageViews } from '../../example/pages';
import { ArchReport, UiScene } from '../../ui-arch';
import { PageGraphProvider } from './page-graph-provider';
import { PageRouteDef } from './page-route-def';

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
          app: ExamplePagesAppDef,
          views: examplePageViews,
          routes,
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
