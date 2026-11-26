import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { UiModuleKind } from './ui-module-kind';

// Образец: раскладка `single` учебного проекта (без пакетов). План вида для
// модуля `profile` повторяет файлы примера: пути, экспорты-значения и
// импорт описания; строка правки набора уже есть в его `index.ts`.

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

/** Спецификатор в константе: в строке теста `from '…'` читался бы как импорт файла */
const DESCRIPTION = '../../../platform/ui';

const PROFILE = [
  `${SRC}/frontend/profile/chat/index.ts`,
  `${SRC}/frontend/profile/chat/profile-chat.views.ts`,
  `${SRC}/frontend/profile/logic/index.ts`,
  `${SRC}/frontend/profile/logic/profile-codes.ts`,
  `${SRC}/frontend/profile/web/index.ts`,
  `${SRC}/frontend/profile/web/profile-web.views.ts`,
  `${SRC}/platform/ui/profile/profile.ui-module.ts`,
];

const plan = (): GenPlan =>
  new UiModuleKind().plan(['profile'], {
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

describe('UiModuleKind — образец: модуль profile учебного проекта', () => {
  it('пути плана — файлы примера, и каждый есть на диске', () => {
    const files = plan()
      .files.map((file) => relative(ROOT, file.path))
      .sort();

    expect(files).toEqual(PROFILE);
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

  it('описание импортируется относительным путём, как в примере', () => {
    const files = plan().files.filter((file) =>
      /(profile-codes|profile-(chat|web)\.views)\.ts$/.test(file.path),
    );

    expect(files).toHaveLength(3);
    for (const file of files) {
      expect(file.content).toContain(`from '${DESCRIPTION}';`);
      expect(readFileSync(file.path, 'utf8')).toContain(
        `from '${DESCRIPTION}';`,
      );
    }
  });

  it('строка правки набора есть в index.ts описания примера дословно', () => {
    const [edit, ...rest] = plan().edits;

    expect(rest).toEqual([]);
    expect(edit?.path).toBe(join(ROOT, `${SRC}/platform/ui/index.ts`));
    expect(readFileSync(edit?.path ?? '', 'utf8')).toContain(edit?.line ?? '');
  });

  it('канала telegram нет в файлах, заметка о нём есть: в примере у profile его нет', () => {
    const result = plan();

    expect(result.files.some((file) => file.path.includes('/telegram/'))).toBe(
      false,
    );
    expect(result.notes).toContain(
      'Канал «telegram»: реестр не создан — шаблоны есть для chat (ChatViews) и web (PageViews); канал на базе держит только перекрытия (profile<База>Views.over).',
    );
  });
});
