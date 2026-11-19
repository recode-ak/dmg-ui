import { describe, expect, test } from 'bun:test';
import { AppGraph } from 'dmg-core/graph';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExampleDialogArch } from './example-dialog.arch';

// Граф учебного примера: `ExampleArch` + поставщик `dmg-ui` + представления
// канала и точки входа трёх приложений — без нарушений (правила ядра, CH-01,
// CH-02). Приложения без карточки пользователя отрезают её ребром `omits`.
// Получатель `taskCompleted` —
// системный query UC на ребре `recipients`, не чтение (UI-12, D-UI-23).

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

  test('omits: карточку пользователя отрезают только приложения без viewUser', () => {
    const omits = (app: string) =>
      graph()
        .outgoing(app, 'omits')
        .map((edge) => edge.to);

    expect(omits('exampleDialog')).toEqual([]);
    expect(omits('exampleTrimmed')).toEqual(['exampleUi/users/viewUser']);
    expect(omits('exampleWindowed')).toEqual(['exampleUi/users/viewUser']);
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
