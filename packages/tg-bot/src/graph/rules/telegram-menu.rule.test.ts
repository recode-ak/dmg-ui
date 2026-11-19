import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import {
  MENU_POINT,
  sceneApp,
  telegramScene,
} from '../../../testing/telegram-graph-scene';

// TG-06: меню укладывается в Bot API. `setMyCommands` — до 100 команд;
// описание команды (название входа, `label`) — 1–256 знаков, длина — в
// единицах UTF-16 (единица не названа в Bot API, берётся строгая). Точки
// `command` и `link` в меню не попадают и описания не требуют.

const START = { entry: 'start', via: 'command', key: 'start' };
const ASSIGNED = { entry: 'assigned', via: 'command', key: 'assigned' };

/** `count` точек `menu` на входе `start` с ключами `c1`…`cN`. */
const menu = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    entry: 'start',
    via: 'menu',
    key: `c${i + 1}`,
  }));

describe('TG-06: число команд меню', () => {
  test('101 точка menu на одном входе — строка про 101 команду из 100', () => {
    const report = ArchReport.of(
      telegramScene({ entryPoints: [START, ASSIGNED, ...menu(101)] }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('TG-06')).toEqual([
      'TG-06: приложение exampleDialog: в меню 101 команд из 100',
    ]);
  });

  test('ровно 100 точек menu — TG-06 молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [START, ASSIGNED, MENU_POINT, ...menu(100)],
      }),
    );

    expect(report.rule('TG-06')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('command и link в счёт меню не идут: 100 menu и сотня прочих — молчит', () => {
    const others = Array.from({ length: 100 }, (_, i) => ({
      entry: 'assigned',
      via: i % 2 === 0 ? 'command' : 'link',
      key: `o${i}`,
    }));
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [START, ASSIGNED, ...menu(100), ...others],
      }),
    );

    expect(report.rule('TG-06')).toEqual([]);
  });
});

describe('TG-06: описание команды — название входа в 1–256 знаков', () => {
  const LONG_LINE = (entry: string, key: string) =>
    `TG-06: точка exampleDialog/point-${entry}-1: описание команды «${key}» (название входа ${entry}) вне 1–256 знаков`;

  test('название входа длиннее 256 знаков у точки menu — строка про описание', () => {
    const report = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: 'я'.repeat(257) }),
        entryPoints: [{ entry: 'start', via: 'menu', key: 'start' }, ASSIGNED],
      }),
    );

    expect(report.rule('TG-06')).toEqual([LONG_LINE('start', 'start')]);
  });

  test('название из 256 знаков — молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: 'я'.repeat(256) }),
        entryPoints: [{ entry: 'start', via: 'menu', key: 'start' }, ASSIGNED],
      }),
    );

    expect(report.rule('TG-06')).toEqual([]);
  });

  test('пустое название входа у точки menu — строка про описание', () => {
    const report = ArchReport.of(
      telegramScene({
        app: sceneApp({ assigned: '' }),
        entryPoints: [
          START,
          { entry: 'assigned', via: 'menu', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-06')).toEqual([LONG_LINE('assigned', 'assigned')]);
  });

  test('длина — в единицах UTF-16: 129 эмодзи (258) — строка, 128 (256) — молчит', () => {
    const over = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: '😀'.repeat(129) }),
        entryPoints: [{ entry: 'start', via: 'menu', key: 'start' }, ASSIGNED],
      }),
    );
    const edge = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: '😀'.repeat(128) }),
        entryPoints: [{ entry: 'start', via: 'menu', key: 'start' }, ASSIGNED],
      }),
    );

    expect(over.rule('TG-06')).toEqual([LONG_LINE('start', 'start')]);
    expect(edge.rule('TG-06')).toEqual([]);
  });

  test('длинное название у точки command — описание не нужно, молчит', () => {
    const report = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: 'я'.repeat(300) }),
        entryPoints: [START, ASSIGNED],
      }),
    );

    expect(report.rule('TG-06')).toEqual([]);
  });

  test('две точки menu на входе с длинным названием — строка на каждую', () => {
    const report = ArchReport.of(
      telegramScene({
        app: sceneApp({ start: 'я'.repeat(257) }),
        entryPoints: [
          { entry: 'start', via: 'menu', key: 'start' },
          { entry: 'start', via: 'menu', key: 'tasks' },
          ASSIGNED,
        ],
      }),
    );

    expect(report.rule('TG-06')).toEqual([
      'TG-06: точка exampleDialog/point-start-1: описание команды «start» (название входа start) вне 1–256 знаков',
      'TG-06: точка exampleDialog/point-start-2: описание команды «tasks» (название входа start) вне 1–256 знаков',
    ]);
  });
});
