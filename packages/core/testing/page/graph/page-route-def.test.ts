import { describe, expect, test } from 'bun:test';
import { PageRouteDef } from './page-route-def';

// Вид Def страничного канала: манифест маршрута (образец — `ScreenDef` из
// `dmg-core/testing/example/screen`). Ссылка на вход — именем.

describe('PageRouteDef: вид Def', () => {
  test('normalize даёт форму маршрута: dmg, тексты, видимость, path и вход', () => {
    const route = PageRouteDef.define({
      name: 'tasks',
      label: 'Мои задачи',
      description: 'Список задач вызывающего.',
      visible: true,
      path: '/',
      entry: 'start',
    });

    expect(route.normalize()).toEqual({
      dmg: 'pageRoute',
      name: 'tasks',
      label: 'Мои задачи',
      description: 'Список задач вызывающего.',
      visible: true,
      path: '/',
      entry: 'start',
    });
  });

  test('видимость по умолчанию — нет, как у любого Def', () => {
    const route = PageRouteDef.define({
      name: 'assigned',
      label: 'Назначенные мне',
      description: 'Поручения вызывающему.',
      path: '/assigned',
      entry: 'assigned',
    });

    expect(route.dmg).toBe('pageRoute');
    expect(route.visible).toBe(false);
    expect(route.normalize()).toMatchObject({ visible: false });
  });

  test('ключи normalize идут в каноническом порядке', () => {
    const route = PageRouteDef.define({
      name: 'a',
      label: 'A',
      description: 'Описание A.',
      path: '/a',
      entry: 'start',
    });

    expect(Object.keys(route.normalize())).toEqual([
      'dmg',
      'name',
      'label',
      'description',
      'visible',
      'path',
      'entry',
    ]);
  });
});
