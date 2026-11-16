import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import {
  ExampleUiSetDef,
  TASK_A,
  TaskCardScreenDef,
} from '../../testing/example';
import { ScreenDef } from '../manifest/screen-def';
import { AddressCodec } from './address-codec';

const codec = new AddressCodec(ExampleUiSetDef);
// Проверки параметров — на карточке: у списка параметр — номер части списка,
// его имя сканер слов канала в `src` не пускает.
const CARD = 'exampleUi/todo/taskCard';

describe('AddressCodec', () => {
  test('encode → JSON-строка → decode: тот же Def и равные параметры', () => {
    const json = codec.encode(TaskCardScreenDef.at({ taskId: TASK_A }));
    const decoded = codec.decode(JSON.parse(JSON.stringify(json)));

    expect(json).toEqual({
      screen: 'exampleUi/todo/taskCard',
      params: { taskId: TASK_A },
    });
    if (!decoded.ok) throw new Error('адрес не декодирован');
    expect(decoded.value.screen).toBe(TaskCardScreenDef);
    expect(decoded.value.params).toEqual({ taskId: TASK_A });
  });

  test('неизвестный id экрана — unknownScreen', () => {
    const res = codec.decode({ screen: 'exampleUi/todo/missing', params: {} });

    expect(res).toEqual({
      ok: false,
      error: { reason: 'unknownScreen', screen: 'exampleUi/todo/missing' },
    });
  });

  test('параметр не того типа — invalidParams с полем', () => {
    const res = codec.decode({ screen: CARD, params: { taskId: 42 } });

    expect(res).toMatchObject({
      ok: false,
      error: {
        reason: 'invalidParams',
        screen: CARD,
        issues: [{ field: 'taskId' }],
      },
    });
  });

  test('нет обязательного параметра — invalidParams с полем', () => {
    const res = codec.decode({ screen: CARD, params: {} });

    expect(res).toMatchObject({
      ok: false,
      error: { reason: 'invalidParams', issues: [{ field: 'taskId' }] },
    });
  });

  test('лишний ключ параметров — invalidParams с этим ключом', () => {
    const res = codec.decode({
      screen: CARD,
      params: { taskId: TASK_A, extra: 1 },
    });

    expect(res).toMatchObject({
      ok: false,
      error: { reason: 'invalidParams', issues: [{ field: 'extra' }] },
    });
  });

  test('не объект или без screen — malformed', () => {
    for (const raw of [42, null, 'taskList', { params: {} }]) {
      expect(codec.decode(raw)).toEqual({
        ok: false,
        error: { reason: 'malformed' },
      });
    }
  });

  test('encode экрана вне набора — бросок с именем экрана', () => {
    const stray = ScreenDef.define({
      name: 'stray',
      label: 'Чужой экран',
      description: 'Экран вне набора.',
      reads: [],
      data: v.object({}),
    });

    expect(() => codec.encode(stray.at({}))).toThrow('stray');
  });
});
