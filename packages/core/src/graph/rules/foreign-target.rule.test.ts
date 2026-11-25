import { describe, expect, test } from 'bun:test';
import { UiScene, UiSetScene } from '../../../testing/ui-arch';
import { Address } from '../../address/address';
import type { AnyScreenDef } from '../../manifest/screen-def.types';
import type { EntrySpec } from '../../manifest/ui-app-def.types';

// Модуль tasks: сторис plan — старт work с выходом done и экран notes (не старт
// ни одной сторис tasks), уведомление alert. Модуль people: сторис view —
// старт card и экран edit (не старт ни одной сторис people).

const card = UiScene.screen('card');
const edit = UiScene.screen('edit');
const view = UiScene.story('view', [card, edit], { start: card });
const work = UiScene.exiting('work');
const notes = UiScene.screen('notes');

/**
 * Сцена: исход done сторис plan ведёт на `after` (нет — умолчание), ссылки
 * alert — `links`, входы приложения — `entries` (нет — вход на work).
 */
const sceneOf = (
  after: AnyScreenDef | undefined,
  links: readonly AnyScreenDef[],
  entries?: Readonly<Record<string, EntrySpec>>,
): UiSetScene => {
  const plan = UiScene.story('plan', [work, notes], {
    start: work,
    outcomes: {
      done: UiScene.outcome(
        work,
        after === undefined ? undefined : new Address(after, {}),
      ),
    },
  });
  const alert = UiScene.notification('alert', { links: () => links });
  return new UiSetScene({
    modules: {
      tasks: {
        screens: [work, notes],
        stories: [plan],
        notifications: [alert],
      },
      people: { screens: [card, edit], stories: [view] },
    },
    ...(entries === undefined ? {} : { entries }),
  });
};

describe('UI-36: цель исхода и ссылка уведомления в чужой модуль — только start его сторис', () => {
  test('R36-1 цель-адрес исхода — экран чужого модуля не start — строка с именем исхода', () => {
    const report = sceneOf(edit, []).report();

    expect(report.rule('UI-36')).toEqual([
      'UI-36: сторис miniUi/tasks/plan направляет исход done на miniUi/people/edit модуля miniUi/people: в чужой модуль — только start его сторис',
    ]);
  });

  test('R36-2 цель-адрес — start сторис чужого модуля — без строки', () => {
    expect(sceneOf(card, []).report().rule('UI-36')).toEqual([]);
  });

  test('R36-3 ссылка уведомления на экран чужого модуля не start — строка', () => {
    const report = sceneOf(undefined, [edit]).report();

    expect(report.rule('UI-36')).toEqual([
      'UI-36: уведомление miniUi/tasks/alert: ссылка на miniUi/people/edit модуля miniUi/people — в чужой модуль только start его сторис',
    ]);
  });

  test('R36-4 ссылка на start сторис чужого модуля — без строки', () => {
    expect(sceneOf(undefined, [card]).report().rule('UI-36')).toEqual([]);
  });

  test('R36-5 цель своего модуля не start — строки UI-36 нет', () => {
    // notes — не старт ни одной сторис, но модуль свой: и исход, и ссылка.
    expect(sceneOf(notes, [notes]).report().rule('UI-36')).toEqual([]);
  });

  test('R36-6 вход приложения на экран чужого модуля не start — строки UI-36 нет (вход свободен)', () => {
    const entries = {
      start: UiScene.entry(work),
      deep: UiScene.entry(edit),
    };

    expect(sceneOf(undefined, [], entries).report().rule('UI-36')).toEqual([]);
  });
});
