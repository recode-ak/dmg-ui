import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { sceneApp, telegramScene } from '../../../testing/telegram-graph-scene';

// TG-05: новичок попадает в бота. Кнопка «Запустить» в пустом чате шлёт
// `/start`; без точки `command` или `menu` с ключом `start` человек
// получит «Такого входа нет». У приложения без входов правило молчит;
// отсутствие точки у входа — дело CH-02.

const LINE = 'TG-05: приложение exampleDialog: нет точки входа для /start';

describe('TG-05: у приложения есть точка для /start', () => {
  test('входы есть, точки start нет — строка TG-05 с приложением', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'start', via: 'command', key: 'tasks' },
          { entry: 'assigned', via: 'command', key: 'assigned' },
        ],
      }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('TG-05')).toEqual([LINE]);
  });

  test('точка command с ключом start — достаточно', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'assigned', via: 'command', key: 'start' },
          { entry: 'start', via: 'command', key: 'tasks' },
        ],
      }),
    );

    expect(report.rule('TG-05')).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('точка menu с ключом start — достаточно', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'start', via: 'menu', key: 'start' },
          { entry: 'assigned', via: 'menu', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-05')).toEqual([]);
  });

  test('ссылка с параметром start — не точка для /start: строка TG-05', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: [
          { entry: 'start', via: 'link', key: 'start' },
          { entry: 'assigned', via: 'link', key: 'assigned' },
        ],
      }),
    );

    expect(report.rule('TG-05')).toEqual([LINE]);
  });

  test('приложение без входов — TG-05 молчит, без броска', () => {
    const report = ArchReport.of(
      telegramScene({ app: sceneApp(false), entryPoints: [] }),
    );

    expect(report.rule('TG-05')).toEqual([]);
  });
});
