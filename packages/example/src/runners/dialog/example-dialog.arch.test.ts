import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type ArchApp, ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExampleUiSetDef } from '../../platform/ui';
import { ExampleDialogArch } from './example-dialog.arch';

// Граф учебного примера без домена: поставщик `dmg-ui` + возможности
// мессенджера и точки входа трёх приложений — без нарушений (правила ядра,
// CH-02, CH-03); лимиты примеров (CH-01) — `example-dialog-views.test.ts`.
// Приложения без карточки пользователя отрезают её ребром `omits`.
// Получатель `taskCompleted` — системный query UC на ребре `recipients`, не
// чтение (UI-12, D-UI-23).

const TASK_COMPLETED = 'exampleUi/todo/taskCompleted';
const ASSIGNEE_UC = 'example/todo/getTaskAssignee';

const graph = () => new AppGraph(ExampleDialogArch).build();

describe('граф учебного примера', () => {
  test('arch:check — нарушений нет, код 0', () => {
    const report = ArchReport.of(ExampleDialogArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });

  test('вход графа на сборке видов — ARC-16: доходит до реализации канала каждого модуля набора', () => {
    const app: ArchApp = {
      ...ExampleDialogArch,
      graphEntry: join(import.meta.dir, 'example-dialog-views.ts'),
    };
    const via =
      'ARC-16: вход графа src/runners/dialog/example-dialog-views.ts доходит до реализации: src/runners/dialog/example-dialog-views.ts импортирует';

    const lines = ArchChecker.of(app)
      .check()
      .map((v) => v.format());

    expect(lines.toSorted()).toEqual(
      ExampleUiSetDef.modules
        .map(
          ({ name }) => `${via} fe-chat ${name}: ../../frontend/${name}/chat`,
        )
        .toSorted(),
    );
    expect(lines).toContain(`${via} fe-chat users: ../../frontend/users/chat`);
  });

  test('omits: карточку пользователя отрезают только приложения без viewUser', () => {
    const omits = (app: string) =>
      graph()
        .outgoing(app, 'omits')
        .map((edge) => edge.to);

    expect(omits('exampleDialog')).toEqual([]);
    expect(omits('exampleTrimmed')).toContain('exampleUi/users/viewUser');
    expect(omits('exampleWindowed')).toContain('exampleUi/users/viewUser');
  });

  test('меню «Начать работу»: вход menu и сторис startWork — в основном и урезанном приложениях, оконное без меню', () => {
    const MENU = 'exampleUi/todo/mainMenu';
    const START_WORK = 'exampleUi/todo/startWork';
    const reaches = (app: string) => [
      graph()
        .outgoing(app, 'entry')
        .some((edge) => edge.to === MENU),
      graph()
        .outgoing(app, 'includes')
        .some((edge) => edge.to === START_WORK),
    ];

    expect(reaches('exampleDialog')).toEqual([true, true]);
    expect(reaches('exampleTrimmed')).toEqual([true, true]);
    expect(reaches('exampleWindowed')).toEqual([false, false]);
  });

  test('цель исхода-адреса: сторис задач ведут на список — ребро redirects', () => {
    const redirects = graph()
      .edges()
      .filter(
        (edge) =>
          edge.kind === 'redirects' && edge.from.startsWith('exampleUi/todo/'),
      )
      .map((edge) => `${edge.from} -> ${edge.to}`);

    expect(redirects).toEqual([
      'exampleUi/todo/finishTasks -> exampleUi/todo/taskList',
      'exampleUi/todo/planTasks -> exampleUi/todo/taskList',
    ]);
  });

  test('taskCompleted: recipients — getTaskAssignee, reads — listAssignedTasks', () => {
    const targets = (kind: string) =>
      graph()
        .outgoing(TASK_COMPLETED, kind)
        .map((edge) => edge.to);

    expect(targets('recipients')).toEqual([ASSIGNEE_UC]);
    expect(targets('reads')).toEqual(['example/todo/listAssignedTasks']);
  });

  test('getTaskAssignee в UI — только на ребре recipients', () => {
    const kinds = graph()
      .edges()
      .filter((edge) => edge.provider === 'dmg-ui' && edge.to === ASSIGNEE_UC)
      .map((edge) => edge.kind);

    expect(kinds).toEqual(['recipients']);
  });
});
