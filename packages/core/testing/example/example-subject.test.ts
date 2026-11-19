import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { exampleSubject } from './example-subject';
import { OWNER } from './todo/example-tasks';
import { TaskCardScreenDef } from './todo/task-card.screen';
import { TaskListScreenDef } from './todo/task-list.screen';

// Субъект примеров — свойство контекста превью проекта: владелец задач,
// которые показывают примеры экранов. Роли у него нет.

describe('exampleSubject', () => {
  test('владелец задач примеров, без ролей', () => {
    expect(exampleSubject.uuid).toBe(OWNER);
    expect(exampleSubject.hasRole('admin')).toBe(false);
  });

  test('задачи примера списка принадлежат субъекту — «Выполнить выбранные» в примере ему доступно', () => {
    const { tasks: rows } = v.parse(
      TaskListScreenDef.data,
      TaskListScreenDef.examples.full?.data,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.ownerId).toBe(exampleSubject.uuid);
  });

  test('задачи примеров карточки принадлежат субъекту', () => {
    for (const example of Object.values(TaskCardScreenDef.examples)) {
      const row = v.parse(TaskCardScreenDef.data, example.data);
      expect(row.ownerId).toBe(exampleSubject.uuid);
    }
  });
});
