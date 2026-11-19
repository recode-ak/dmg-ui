import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { PageGraphProvider, PageNotePresenter } from 'dmg-ui/web-ui';
import { ExamplePagesAppDef, examplePageRoutes } from 'dmg-ui/web-ui/testing';
import { ExampleScreenView, ExampleViews } from '../view/example-views';
import { ExampleWebArch } from './example-web.arch';

// Граф примера для браузера: домен учебного приложения, поставщик `dmg-ui` и
// поставщик страничного канала с реестром представлений на DOM. Реестр
// структурно подходит графу (`set`, `presented()`): правки графа нет, ребро
// `presents` у каждого экрана и уведомления одно.

const ownEdges = () =>
  new AppGraph(ExampleWebArch)
    .build()
    .edges()
    .filter(
      (edge) => edge.provider === 'dmg-ui-pages' && edge.kind === 'presents',
    )
    .map((edge) => `${edge.from} -> ${edge.to}`)
    .sort();

describe('ExampleWebArch', () => {
  test('arch:check — код 0 и итоговые строки без нарушений', () => {
    const report = ArchReport.of(ExampleWebArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });

  test('ArchChecker не находит нарушений', () => {
    expect(ArchChecker.of(ExampleWebArch).check()).toEqual([]);
  });

  test('рёбра presents идут от приложения к пяти экранам и двум уведомлениям', () => {
    expect(ownEdges()).toEqual([
      'examplePages -> exampleUi/todo/assignedTasks',
      'examplePages -> exampleUi/todo/mainMenu',
      'examplePages -> exampleUi/todo/taskAssigned',
      'examplePages -> exampleUi/todo/taskCard',
      'examplePages -> exampleUi/todo/taskCompleted',
      'examplePages -> exampleUi/todo/taskList',
      'examplePages -> exampleUi/users/userCard',
    ]);
  });

  test('второго ребра presents на один и тот же экран нет', () => {
    const edges = ownEdges();

    expect(new Set(edges).size).toBe(edges.length);
  });
});

describe('реестр на DOM в графе — экран без представления', () => {
  test('нет представления карточки — нет ребра presents на неё, UI-06 в отчёте arch:check', () => {
    const views = ExampleViews.of(ExampleUiSetDef, [
      ExampleScreenView.for(TaskListScreenDef, () => ({
        kind: 'assigned',
        rows: [],
        actions: [],
      })),
      PageNotePresenter.for(TaskAssignedNotificationDef, () => 'a'),
      PageNotePresenter.for(TaskCompletedNotificationDef, () => 'b'),
    ]);
    const scene = {
      ...ExampleArch,
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [ExamplePagesAppDef],
        }),
        new PageGraphProvider({
          apps: [{ app: ExamplePagesAppDef, views, routes: examplePageRoutes }],
        }),
      ],
    };

    const report = ArchReport.of(scene);

    expect(report.code).not.toBe(0);
    expect(report.rule('UI-06').join('\n')).toContain(
      'exampleUi/todo/taskCard',
    );
    expect(
      new AppGraph(scene)
        .build()
        .edges()
        .filter(
          (edge) => edge.kind === 'presents' && edge.to.endsWith('taskCard'),
        ),
    ).toEqual([]);
  });
});
