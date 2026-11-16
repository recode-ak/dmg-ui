import { describe, expect, test } from 'bun:test';
import { TaskListScreenDef } from '../../testing/ui-fixture';
import { TaskListScreenCode } from '../../testing/ui-fixture-code';
import type { DataOf } from '../manifest/screen-def.types';
import { ScreenCode } from '../screen/screen-code';
import type { ActionSteps } from '../screen/screen-code.types';
import { ScreenUnit } from './screen-unit';

// Сверка кода экрана с манифестом в конструкторе `ScreenUnit` (решение 6
// брифа Ф4): нет `load` или нет `done` у действия — ошибка программиста.

type List = typeof TaskListScreenDef;

/** Код списка без загрузки. */
class NoLoad extends ScreenCode<List> {
  private readonly full = new TaskListScreenCode();
  override readonly locals = this.full.locals;
  override readonly actions = this.full.actions;

  override initialState(data: DataOf<List>) {
    return this.full.initialState(data);
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

  test('полный код — юнит собран', () => {
    const unit = new ScreenUnit(TaskListScreenDef, new TaskListScreenCode());

    expect(unit.def).toBe(TaskListScreenDef);
  });
});
