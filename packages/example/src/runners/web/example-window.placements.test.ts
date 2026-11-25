import { describe, expect, test } from 'bun:test';
import { TaskCardScreenDef } from '../../platform/ui';
import { exampleWindowPlacements } from './example-window.placements';

// Размещение окна учебного примера: карточка задачи открывается в модальной
// области, а не в боковой панели по умолчанию. Остальные экраны — по
// умолчанию страничного канала.

describe('exampleWindowPlacements', () => {
  test('одно размещение: карточка задачи — в области modal', () => {
    expect(exampleWindowPlacements).toEqual([
      { screen: TaskCardScreenDef, region: 'modal' },
    ]);
  });
});
