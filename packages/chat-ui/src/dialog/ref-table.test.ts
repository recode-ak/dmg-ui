import { describe, expect, test } from 'bun:test';
import { RuntimeKit } from 'dmg-ui/testing/fixtures';
import { RefTable } from './ref-table';

// Короткие ссылки вариантов реплик: ссылка → цель. Старые ссылки живут, как
// прошлые кнопки мессенджера; их судьбу решает ядро (`stale`, `closed`).

describe('RefTable', () => {
  test('ссылка → цель действия с ревизией и экземпляром; ссылки разные', async () => {
    const instance = await new RuntimeKit().openList();
    const refs = new RefTable();

    const next = refs.add({
      kind: 'action',
      instance,
      revision: 1,
      action: 'next',
      fields: [],
    });
    const open = refs.add({
      kind: 'open',
      address: { screen: 'exampleUi/todo/taskList', params: { page: 0 } },
    });

    expect(next).not.toBe(open);
    expect(refs.target(next)).toEqual({
      kind: 'action',
      instance,
      revision: 1,
      action: 'next',
      fields: [],
    });
    expect(refs.target(open)).toMatchObject({ kind: 'open' });
  });

  test('неизвестная ссылка — цели нет', () => {
    const refs = new RefTable();
    refs.add({
      kind: 'open',
      address: { screen: 'exampleUi/todo/taskList', params: { page: 0 } },
    });

    expect(refs.target('r999')).toBeUndefined();
    expect(refs.target('мусор')).toBeUndefined();
  });
});
