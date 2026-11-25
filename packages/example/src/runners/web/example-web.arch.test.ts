import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { MainMenuScreenDef, StartWorkStoryDef } from '../../platform/ui';
import { examplePagesRoutes } from './example-pages.routes';
import { ExamplePagesUiAppDef } from './example-pages.ui-app';
import { ExampleWebArch } from './example-web.arch';

// Граф примера для браузера: домен учебного приложения, поставщик `dmg-ui` и
// поставщик страничного канала с маршрутами. Полноту сборки представлений на
// DOM держит её конструктор (`example-web-views.test.ts`), не граф.
// Меню «Начать работу» — вход `menu`, маршрут `/menu` и сторис `startWork`,
// как у приложения диалога.

describe('ExampleWebArch', () => {
  test('arch:check — код 0, итоговые строки без нарушений, ArchChecker молчит', () => {
    const report = ArchReport.of(ExampleWebArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
    expect(ArchChecker.of(ExampleWebArch).check()).toEqual([]);
  });

  test('в графе нет узлов приложения диалога', () => {
    const ids = new AppGraph(ExampleWebArch)
      .build()
      .nodes()
      .map((node) => node.id);

    expect(ids).toContain('examplePages');
    expect(ids).not.toContain('exampleStub');
  });
});

describe('меню в приложении страниц', () => {
  test('вход menu — экран mainMenu; сторис startWork первая, как в приложении диалога', () => {
    expect(ExamplePagesUiAppDef.entries.menu?.address).toEqual(
      MainMenuScreenDef.at({}),
    );
    expect(ExamplePagesUiAppDef.stories[0]).toBe(StartWorkStoryDef);
  });

  test('маршрут /menu ведёт на вход menu и не пересекается с общим путём экрана — PG-06 молчит', () => {
    const route = examplePagesRoutes.find((r) => r.entry === 'menu');

    expect(route?.path).toBe('/menu');
    expect(ArchReport.of(ExampleWebArch).rule('PG-06')).toEqual([]);
  });
});
