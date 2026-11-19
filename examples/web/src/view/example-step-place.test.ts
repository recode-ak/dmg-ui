import { describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { ASSIGNED_ID, CARD_ID, LIST_ID, TASK_A } from 'dmg-ui/testing';
import { MemoryPageHistory } from 'dmg-ui/web-ui/testing';
import {
  exampleWorld,
  openTab,
  settle,
  TOKEN_ANNA,
} from '../testing/example-world';
import { ExampleStepPlace } from './example-step-place';

// Правило шага учебного приложения: листание списка задач — шаг истории
// (ключ списка включает страницу), остальные экраны — по экрану, как у ядра.

const tmp = useTempDir('example-step-place-');

describe('ExampleStepPlace.key — ключ места по адресу корня', () => {
  test('список: страницы дают разные ключи, одна страница — один ключ', () => {
    const first = { screen: LIST_ID, params: { page: 0 } };
    const second = { screen: LIST_ID, params: { page: 1 } };

    expect(ExampleStepPlace.key(first)).not.toBe(ExampleStepPlace.key(second));
    expect(ExampleStepPlace.key(second)).toBe(
      ExampleStepPlace.key({ screen: LIST_ID, params: { page: 1 } }),
    );
  });

  test('остальные экраны — сам экран, параметры в ключ не входят', () => {
    expect(ExampleStepPlace.key({ screen: ASSIGNED_ID, params: {} })).toBe(
      ASSIGNED_ID,
    );
    expect(
      ExampleStepPlace.key({ screen: CARD_ID, params: { taskId: TASK_A } }),
    ).toBe(CARD_ID);
  });
});

describe('ExampleStepPlace в мире примера', () => {
  test('«Дальше» — запись истории, «Назад» — первая страница списка', async () => {
    const world = exampleWorld(tmp().path);
    const history = new MemoryPageHistory('/');
    const tab = await openTab(world, TOKEN_ANNA, 'a', undefined, {
      history,
      stepPlace: ExampleStepPlace.key,
    });
    await tab.client.boot();
    for (const title of ['Сыр', 'Хлеб', 'Чай']) {
      await tab.client.submit('main', 'create', { title });
    }
    await settle(world, tab);
    expect(history.pushes).toBe(0);

    await tab.client.submit('main', 'next', {});

    expect(history.pushes).toBe(1);
    expect(history.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/?page=1',
    ]);
    expect(tab.client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    await history.back();
    expect(tab.client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 0 },
    });
    await history.forward();
    expect(tab.client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
  });
});
