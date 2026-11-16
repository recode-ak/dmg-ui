import { describe, expect, test } from 'bun:test';
import {
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../../example';
import { UiScene } from '../../ui-arch';
import { PageNotePresenter, PagePresenter, PageViews } from './page-views';

// Реестр представлений страничного канала: ключ — `id` из `UiIds` (образец —
// реестр представлений диалогового канала пакета `chat-ui`). Чужой Def и повтор — ошибка сборки канала, бросок.

const ID = {
  list: 'exampleUi/todo/taskList',
  card: 'exampleUi/todo/taskCard',
  assigned: 'exampleUi/todo/taskAssigned',
  completed: 'exampleUi/todo/taskCompleted',
};

const list = PagePresenter.for(TaskListScreenDef, () => 'список');
const card = PagePresenter.for(TaskCardScreenDef, () => 'карточка');
const assigned = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `Назначена: ${title}`,
);
const completed = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `Выполнена: ${title}`,
);

describe('PageViews.of', () => {
  test('экран и уведомление находятся по id из UiIds', () => {
    const views = PageViews.of(ExampleUiSetDef, [
      list,
      card,
      assigned,
      completed,
    ]);

    expect(views.screen(ID.list).def).toBe(TaskListScreenDef);
    expect(views.screen(ID.card).def).toBe(TaskCardScreenDef);
    expect(views.notification(ID.assigned).def).toBe(
      TaskAssignedNotificationDef,
    );
    expect(views.notification(ID.completed).def).toBe(
      TaskCompletedNotificationDef,
    );
  });

  test('presented — id всех экранов и уведомлений с представлением', () => {
    const views = PageViews.of(ExampleUiSetDef, [list, assigned, card]);

    expect([...views.presented()].sort()).toEqual(
      [ID.assigned, ID.card, ID.list].sort(),
    );
  });

  test('presented пуст, если представлений нет', () => {
    expect(PageViews.of(ExampleUiSetDef, []).presented()).toEqual([]);
  });

  test('бросок, если экран не входит в набор', () => {
    const foreign = PagePresenter.for(UiScene.screen('foreign'), () => 'чужой');

    expect(() => PageViews.of(ExampleUiSetDef, [list, foreign])).toThrow(
      'foreign',
    );
  });

  test('бросок, если два представления одного экрана', () => {
    const again = PagePresenter.for(TaskListScreenDef, () => 'ещё список');

    expect(() => PageViews.of(ExampleUiSetDef, [list, again])).toThrow(ID.list);
  });

  test('бросок, если два представления одного уведомления', () => {
    const again = PageNotePresenter.for(
      TaskAssignedNotificationDef,
      () => 'ещё',
    );

    expect(() => PageViews.of(ExampleUiSetDef, [assigned, again])).toThrow(
      ID.assigned,
    );
  });
});

describe('PageViews: поиск без представления', () => {
  test('нет представления экрана — бросок с id', () => {
    const views = PageViews.of(ExampleUiSetDef, [list]);

    expect(() => views.screen(ID.card)).toThrow(ID.card);
  });

  test('нет представления уведомления — бросок с id', () => {
    const views = PageViews.of(ExampleUiSetDef, [assigned]);

    expect(() => views.notification(ID.completed)).toThrow(ID.completed);
  });
});

describe('PageNotePresenter', () => {
  test('text проверяет данные схемой уведомления и отдаёт текст', () => {
    expect(assigned.text({ title: 'Сыр' })).toBe('Назначена: Сыр');
  });

  test('данные не по схеме — бросок, не приведение', () => {
    expect(() => assigned.text({ title: 42 })).toThrow();
  });
});
