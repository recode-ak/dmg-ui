import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import {
  MENU_POINT,
  telegramScene,
} from '../../../testing/telegram-graph-scene';
import { RESERVED_COMMANDS } from '../../entries/telegram-entries.const';

// TG-04: команда не занимает имя беседы. `cancel`, `back`, `help` и `link`
// приём отдаёт беседе раньше таблицы, поэтому точка с таким ключом
// недостижима (D-UI-127: к `help` добавлен `link`).

const START = { entry: 'start', via: 'command', key: 'start' };
const ASSIGNED = { entry: 'assigned', via: 'command', key: 'assigned' };

describe('TG-04: команда не занимает имя беседы', () => {
  test('занятые имена — ровно cancel, back, help, link', () => {
    expect([...RESERVED_COMMANDS].sort()).toEqual([
      'back',
      'cancel',
      'help',
      'link',
    ]);
  });

  test.each([
    ['command', 'cancel'],
    ['command', 'back'],
    ['menu', 'cancel'],
    ['menu', 'back'],
    ['command', 'help'],
    ['menu', 'help'],
    ['command', 'link'],
    ['menu', 'link'],
  ])('%s «%s» — строка TG-04 с узлом и занятыми именами', (via, key) => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [START, ASSIGNED, { entry: 'start', via, key }],
      }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('TG-04')).toEqual([
      `TG-04: точка exampleDialog/point-start-2: команда «${key}» занята беседой (${RESERVED_COMMANDS.join(', ')})`,
    ]);
  });

  test('start и обычная команда — TG-04 молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          { entry: 'start', via: 'menu', key: 'tasks' },
          ASSIGNED,
          MENU_POINT,
        ],
      }),
    );

    expect(report.rule('TG-04')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('ссылка с параметром cancel — не имя беседы, TG-04 молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          START,
          ASSIGNED,
          { entry: 'start', via: 'link', key: 'cancel' },
        ],
      }),
    );

    expect(report.rule('TG-04')).toEqual([]);
  });
});
