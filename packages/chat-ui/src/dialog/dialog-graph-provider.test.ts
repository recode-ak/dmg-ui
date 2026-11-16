import { describe, expect, test } from 'bun:test';
import type { ArchApp } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { ArchReport, StubViewProvider } from 'dmg-ui/testing/fixtures';
import { ExampleDialogAppDef, ExampleDialogArch } from '../../testing';
import { AssignedTasksView } from '../../testing/example/assigned-tasks.view';
import { TaskListView } from '../../testing/example/task-list.view';
import {
  TaskAssignedView,
  TaskCompletedView,
} from '../../testing/example/task-notes.view';
import { DialogGraphProvider, DialogViews } from './index';

// Второй поставщик графа — диалоговый канал: рёбра `presents` от приложения
// UI к экранам и уведомлениям с представлением; своих видов и правил нет.

const graph = () => new AppGraph(ExampleDialogArch).build();

describe('DialogGraphProvider на графе примера', () => {
  test('presents — от exampleDialog к каждому экрану и уведомлению, поставщик dmg-ui-dialog', () => {
    const presents = graph()
      .edges()
      .filter((edge) => edge.kind === 'presents');

    expect(presents.map((edge) => `${edge.from} -> ${edge.to}`).sort()).toEqual(
      [
        'exampleDialog -> exampleUi/todo/assignedTasks',
        'exampleDialog -> exampleUi/todo/taskAssigned',
        'exampleDialog -> exampleUi/todo/taskCard',
        'exampleDialog -> exampleUi/todo/taskCompleted',
        'exampleDialog -> exampleUi/todo/taskList',
      ],
    );
    expect(new Set(presents.map((edge) => edge.provider))).toEqual(
      new Set(['dmg-ui-dialog']),
    );
  });

  test('поставщик канала — dmg-ui-dialog без своих видов; заглушки представления нет', () => {
    const providers = ExampleDialogArch.providers ?? [];
    const dialog = providers.find(
      (provider) => provider instanceof DialogGraphProvider,
    );

    expect(dialog?.name).toBe('dmg-ui-dialog');
    expect(dialog?.kinds()).toEqual({ nodes: [], edges: [] });
    expect(
      providers.some((provider) => provider instanceof StubViewProvider),
    ).toBe(false);
  });
});

describe('DialogGraphProvider — экран без представления', () => {
  test('нет представления карточки — нет ребра presents, UI-06 в отчёте arch:check', () => {
    const views = DialogViews.of(ExampleUiSetDef, [
      TaskListView,
      AssignedTasksView,
      TaskAssignedView,
      TaskCompletedView,
    ]);
    const app: ArchApp = {
      ...ExampleArch,
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [ExampleDialogAppDef],
        }),
        new DialogGraphProvider({ app: ExampleDialogAppDef, views }),
      ],
    };

    const report = ArchReport.of(app);

    expect(report.code).not.toBe(0);
    expect(report.rule('UI-06')).toEqual([
      'UI-06: приложение exampleDialog: у экрана exampleUi/todo/taskCard нет представления в канале',
    ]);
  });
});
