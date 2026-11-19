import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import {
  MENU_POINT,
  telegramScene,
} from '../../../testing/telegram-graph-scene';

// TG-01: способ точки входа известен Telegram — `command`, `menu`, `link`.
// Правило читает узлы `chatEntryPoint` приложений с мессенджером `telegram`;
// точка с чужим способом не даёт строк других TG-правил.

const START = { entry: 'start', via: 'command', key: 'start' };
const ASSIGNED = { entry: 'assigned', via: 'command', key: 'assigned' };

/** Все строки правил TG отчёта. */
const tg = (report: ArchReport) =>
  report.lines.filter((line) => line.startsWith('TG-'));

describe('TG-01: способ точки входа известен Telegram', () => {
  test('точка via «message» — строка TG-01 с узлом, способом и списком способов', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'start', via: 'message', key: 'start' },
          START,
          ASSIGNED,
        ],
      }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('TG-01')).toEqual([
      'TG-01: точка exampleDialog/point-start-1: способ «message» неизвестен Telegram (command, menu, link)',
    ]);
    expect(tg(report)).toEqual(report.rule('TG-01'));
  });

  test('каждая неизвестная точка — своя строка', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'assigned', via: 'button', key: 'assigned' },
          { entry: 'assigned', via: 'Command', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-01')).toEqual([
      'TG-01: точка exampleDialog/point-assigned-1: способ «button» неизвестен Telegram (command, menu, link)',
      'TG-01: точка exampleDialog/point-assigned-2: способ «Command» неизвестен Telegram (command, menu, link)',
    ]);
  });

  test('command, menu и link — TG-01 молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'assigned', via: 'menu', key: 'assigned' },
          { entry: 'assigned', via: 'link', key: 'assigned' },
          MENU_POINT,
        ],
      }),
    );

    expect(report.rule('TG-01')).toEqual([]);
    expect(report.code).toBe(0);
  });
});
