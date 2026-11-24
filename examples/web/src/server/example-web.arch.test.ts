import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExampleWebArch } from './example-web.arch';

// Граф примера для браузера: домен учебного приложения, поставщик `dmg-ui` и
// поставщик страничного канала со сборкой представлений на DOM. Сборка
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
