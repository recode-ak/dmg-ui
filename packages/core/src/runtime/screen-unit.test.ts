import { describe, expect, test } from 'bun:test';
import { TaskListScreenDef } from '../../testing/example';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.scode';
import { ScreenCode } from '../screen/screen-code';
import type { ActionSteps } from '../screen/screen-code.types';
import { ScreenUnit } from './screen-unit';

// Сверка кода экрана с манифестом в конструкторе `ScreenUnit`: нет `load`
// или нет `done` у действия — ошибка программиста.

type List = typeof TaskListScreenDef;

/** Код списка без загрузки. */
class NoLoad extends ScreenCode<List> {
  private readonly full = new TaskListScreenCode();
  override readonly locals = this.full.locals;
  override readonly actions = this.full.actions;

  override initialState() {
    return this.full.initialState();
  }
}

/** Код списка без шагов действия `next`. */
class NoDone extends TaskListScreenCode {
  override readonly actions: Partial<ActionSteps<List>> = {
    ...new TaskListScreenCode().actions,
    next: undefined,
  };
}

describe('ScreenUnit — сверка кода с манифестом', () => {
  test('нет load — бросок с именем экрана', () => {
    expect(() => new ScreenUnit(TaskListScreenDef, new NoLoad())).toThrow(
      /taskList.*load/,
    );
  });

  test('нет done у действия — бросок с именем действия', () => {
    expect(() => new ScreenUnit(TaskListScreenDef, new NoDone())).toThrow(
      /taskList.*next/,
    );
  });
});
