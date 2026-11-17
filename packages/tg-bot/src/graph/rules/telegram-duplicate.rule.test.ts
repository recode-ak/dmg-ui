import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { telegramScene } from '../../../testing/telegram-graph-scene';

// TG-03: ключ ведёт на один вход. Команда и меню — одно пространство
// (в приёме это одно сообщение `/key`), ссылка — своё (`/start <key>`).
// В приложении один и тот же ключ дважды — строка с узлами обеих точек в
// порядке `id` (граф хранит узлы отсортированными; порядок таблицы правилу
// недоступен).

const START = { entry: 'start', via: 'command', key: 'start' };

describe('TG-03: ключ ведёт на один вход', () => {
  test('одна команда на двух входах — строка с обоими узлами', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'start', via: 'command', key: 'tasks' },
          { entry: 'assigned', via: 'command', key: 'tasks' },
        ],
      }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('TG-03')).toEqual([
      'TG-03: приложение exampleDialog: команда «tasks» объявлена дважды (exampleDialog/point-assigned-1, exampleDialog/point-start-2)',
    ]);
  });

  test('одна команда и в command, и в menu — одно пространство, строка про команду', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'start', via: 'command', key: 'tasks' },
          { entry: 'start', via: 'menu', key: 'tasks' },
          { entry: 'assigned', via: 'command', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-03')).toEqual([
      'TG-03: приложение exampleDialog: команда «tasks» объявлена дважды (exampleDialog/point-start-2, exampleDialog/point-start-3)',
    ]);
  });

  test('один параметр ссылки на двух входах — строка про ссылку с обоими узлами', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'assigned', via: 'link', key: 'abc' },
          { entry: 'start', via: 'link', key: 'abc' },
          { entry: 'assigned', via: 'command', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-03')).toEqual([
      'TG-03: приложение exampleDialog: ссылка «abc» объявлена дважды (exampleDialog/point-assigned-1, exampleDialog/point-start-2)',
    ]);
  });

  test('команда и параметр ссылки с одним ключом — не нарушение', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'start', via: 'link', key: 'start' },
          { entry: 'assigned', via: 'command', key: 'assigned' },
          { entry: 'assigned', via: 'link', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-03')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('разные ключи — TG-03 молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'assigned', via: 'menu', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-03')).toEqual([]);
  });
});
