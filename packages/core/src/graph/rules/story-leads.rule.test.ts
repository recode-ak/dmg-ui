import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';
import type { AnyScreenDef } from '../../manifest/screen-def';
import type { StoryDef } from '../../manifest/story-def';

const b = UiScene.screen('b');
const c = UiScene.screen('c');
const target = UiScene.story('target', [b, c], { start: b });
/** Сторис `s` — источник связи с `target`; `extra` — другие сторис набора. */
const run = (
  screens: readonly AnyScreenDef[],
  extra: readonly StoryDef[] = [],
) => {
  const source = UiScene.story('s', screens, { leads: () => [target] });
  const stories = [source, target, ...extra];
  return new UiScene({
    screens: [...new Set(stories.flatMap((story) => story.screens))],
    stories,
  }).report();
};

describe('UI-24: связь сторис подтверждена переходом на стартовый экран цели', () => {
  test('нарушение: ни один экран источника не переходит на старт цели', () => {
    const a = UiScene.screen('a');

    const report = run([a]);

    expect(report.code).toBe(1);
    expect(report.rule('UI-24')).toEqual([
      'UI-24: сторис miniUi/todo/s: связь с miniUi/todo/target не подтверждена переходом на её стартовый экран miniUi/todo/b',
    ]);
  });

  test('без нарушения: экран источника переходит на старт цели', () => {
    const a = UiScene.screen('a', { actions: { go: UiScene.jump(b) } });

    expect(run([a]).rule('UI-24')).toEqual([]);
  });

  test('нарушение: переход на не-старт экран цели связь не подтверждает', () => {
    const a = UiScene.screen('a', { actions: { go: UiScene.jump(c) } });

    expect(run([a]).rule('UI-24')).toEqual([
      'UI-24: сторис miniUi/todo/s: связь с miniUi/todo/target не подтверждена переходом на её стартовый экран miniUi/todo/b',
    ]);
  });

  test('без нарушения: переход из любого экрана источника подтверждает связь', () => {
    const a = UiScene.screen('a');
    const next = UiScene.screen('next', { actions: { go: UiScene.jump(b) } });

    expect(run([a, next]).rule('UI-24')).toEqual([]);
  });

  test('нарушение только у источника без перехода: два источника одной цели', () => {
    const jumper = UiScene.screen('jumper', {
      actions: { go: UiScene.jump(b) },
    });
    const idle = UiScene.screen('idle');
    const second = UiScene.story('second', [idle], { leads: () => [target] });

    const report = run([jumper], [second]);

    expect(report.rule('UI-24')).toEqual([
      'UI-24: сторис miniUi/todo/second: связь с miniUi/todo/target не подтверждена переходом на её стартовый экран miniUi/todo/b',
    ]);
  });

  test('без нарушения: общий стартовый экран двух источников подтверждает обе связи', () => {
    const shared = UiScene.screen('shared', {
      actions: { go: UiScene.jump(b) },
    });
    const second = UiScene.story('second', [shared], {
      leads: () => [target],
    });

    expect(run([shared], [second]).rule('UI-24')).toEqual([]);
  });

  test('без нарушения: сторис без связей', () => {
    const a = UiScene.screen('a');
    const lone = UiScene.story('lone', [a]);
    const scene = new UiScene({ screens: [a], stories: [lone] });

    expect(scene.report().rule('UI-24')).toEqual([]);
  });
});
