import { describe, expect, test } from 'bun:test';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';
import {
  type SignalSpec,
  StubSignalProvider,
} from '../../../testing/ui-graph-fixture';

const scene = new UiScene({ screens: [UiScene.screen('a')] });
const run = (spec: SignalSpec) =>
  scene.report([new StubSignalProvider(scene.set, scene.app, spec)]);

describe('UI-10: узел, привязанный к событию, не вызывает command UC', () => {
  test('нарушение: сигнал по событию вызывает command UC по invokes', () => {
    const report = run({
      event: TaskEvents.created,
      invokes: CreateTaskUcDef,
    });

    expect(report.code).toBe(1);
    expect(report.rule('UI-10')).toEqual([
      'UI-10: miniConsole/signal привязан к событию и вызывает command UC example/todo/createTask',
    ]);
  });

  test('нарушение: сигнал по событию читает command UC по reads', () => {
    const report = run({ event: TaskEvents.created, reads: CompleteTaskUcDef });

    expect(report.rule('UI-10')).toEqual([
      'UI-10: miniConsole/signal привязан к событию и вызывает command UC example/todo/completeTask',
    ]);
  });

  test('без нарушения: сигнал без события вызывает command UC', () => {
    expect(run({ invokes: CreateTaskUcDef }).rule('UI-10')).toEqual([]);
  });

  test('без нарушения: сигнал по событию читает query UC', () => {
    const report = run({ event: TaskEvents.created, reads: ListTasksUcDef });

    expect(report.rule('UI-10')).toEqual([]);
  });
});
