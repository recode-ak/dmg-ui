import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { StoryKind } from './story-kind';

// Образец: раскладка `single` учебного проекта (без пакетов). План вида
// для сторис `check-profile` и её экрана `profile-summary` повторяет файлы примера: пути и экспорты-значения;
// строки правок набора уже есть в его `index.ts`.

const ROOT = resolve(import.meta.dir, '../../..');
const SRC = 'packages/example/src';

const LAYERS: Record<string, LayerPlace> = {
  ui: { dir: `${SRC}/platform/ui` },
  'fe-app': { dir: `${SRC}/frontend/app` },
  'fe-logic': { dir: `${SRC}/frontend/{m}/logic` },
  'fe-chat': { dir: `${SRC}/frontend/{m}/chat` },
  'chat-kit': { dir: `${SRC}/frontend/chat-kit` },
  'fe-telegram': { dir: `${SRC}/frontend/{m}/telegram` },
  'telegram-kit': { dir: `${SRC}/frontend/telegram-kit` },
  'fe-web': { dir: `${SRC}/frontend/{m}/web` },
  'web-kit': { dir: `${SRC}/frontend/web-kit` },
};

const EXAMPLE_FILES = [
  `${SRC}/frontend/profile/chat/check-profile/profile-summary.view.ts`,
  `${SRC}/frontend/profile/logic/check-profile/profile-summary.scode.ts`,
  `${SRC}/frontend/profile/web/check-profile/profile-summary.view.ts`,
  `${SRC}/platform/ui/profile/check-profile/check-profile.story.ts`,
  `${SRC}/platform/ui/profile/check-profile/profile-summary.screen.ts`,
];

const plan = (): GenPlan =>
  new StoryKind().plan(['profile', 'check-profile', 'profile-summary'], {
    layout: GenLayout.from(ProjectConfig.parse({ layers: LAYERS }), ROOT),
  });

/** Экспорты-значения файла: `export const|class|function` и `export { x }` без `export type` */
const valueExports = (text: string): string[] => {
  const names = [
    ...text.matchAll(/^export (?:const|class|function) (\w+)/gm),
  ].map((match) => match[1] ?? '');
  for (const match of text.matchAll(/^export \{([^}]*)\}/gm)) {
    names.push(
      ...(match[1] ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    );
  }
  return names.sort();
};

describe('StoryKind — образец: сторис check-profile модуля profile', () => {
  it('пути плана — файлы примера, и каждый есть на диске', () => {
    const files = plan()
      .files.map((file) => relative(ROOT, file.path))
      .sort();

    expect(files).toEqual(EXAMPLE_FILES);
    for (const path of files) {
      expect(existsSync(join(ROOT, path))).toBe(true);
    }
  });

  it('экспорты-значения каждого файла совпадают с файлом примера', () => {
    for (const file of plan().files) {
      const example = readFileSync(file.path, 'utf8');

      expect(valueExports(file.content)).toEqual(valueExports(example));
    }
  });

  it('строки правки набора есть в index.ts описания примера дословно', () => {
    const exports = plan().edits.filter(
      (edit) => edit.marker === '// gen:exports',
    );
    const index = join(ROOT, `${SRC}/platform/ui/index.ts`);

    expect(exports).toHaveLength(2);
    for (const edit of exports) {
      expect(edit.path).toBe(index);
      expect(readFileSync(index, 'utf8')).toContain(edit.line);
    }
  });
});
