import { describe, expect, test } from 'bun:test';
import { ArchChecker } from 'dmg-core/arch';
import { AppGraph } from 'dmg-core/graph';
import { MainMenuScreenDef, StartWorkStoryDef } from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { ExamplePagesAppDef } from './example-pages.app';
import { ExamplePagesArch } from './example-pages.arch';
import { examplePageRoutes } from './example-pages.routes';

// Привязка примера к страничному каналу: граф `examplePages` проходит
// `arch:check` без нарушений; меню «Начать работу» — вход `menu`, маршрут
// `/menu` и сторис `startWork`, как у приложения диалога.

describe('ExamplePagesArch', () => {
  test('reportArchCheck — код 0 и итоговые строки без нарушений', () => {
    const report = ArchReport.of(ExamplePagesArch);

    expect(report.code).toBe(0);
    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
  });

  test('ArchChecker не находит нарушений', () => {
    expect(ArchChecker.of(ExamplePagesArch).check()).toEqual([]);
  });

  test('в графе нет узлов приложения диалога', () => {
    const ids = new AppGraph(ExamplePagesArch)
      .build()
      .nodes()
      .map((node) => node.id);

    expect(ids).toContain('examplePages');
    expect(ids).not.toContain('exampleStub');
  });
});

describe('меню в приложении страниц', () => {
  test('вход menu — экран mainMenu; сторис startWork первая, как в приложении диалога', () => {
    expect(ExamplePagesAppDef.entries.menu?.address).toEqual(
      MainMenuScreenDef.at({}),
    );
    expect(ExamplePagesAppDef.stories[0]).toBe(StartWorkStoryDef);
  });

  test('маршрут /menu ведёт на вход menu и не пересекается с общим путём экрана — PG-06 молчит', () => {
    const route = examplePageRoutes.find((r) => r.entry === 'menu');

    expect(route?.path).toBe('/menu');
    expect(ArchReport.of(ExamplePagesArch).rule('PG-06')).toEqual([]);
  });
});
