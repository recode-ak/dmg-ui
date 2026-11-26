import { join } from 'node:path';
import type { GenContext, GenPlan, GenProviderKind } from 'dmg-core/gen';
import { ModuleEdits } from './module-edits';
import { PlannedEdits } from './planned-edits';
import { StorySources } from './story-sources';
import { SCREEN_NODE, SHARED_FOLDER } from './ui-node.const';
import { UiNodeInput } from './ui-node-input';
import { UiNodePlan } from './ui-node-plan';
import { UiNodeSources } from './ui-node-sources';

/**
 * `gen story <модуль> <сторис> <экран>` — пустая сторис UI-модуля вместе с
 * её экраном `start`: сторис без экрана не собирается. Файлы сторис и экрана
 * лежат в папке `<сторис>`.
 */
export class StoryKind implements GenProviderKind {
  readonly name = 'story';
  readonly usage = '<модуль> <сторис> <экран>';
  private readonly input = new UiNodeInput(this.name, this.usage, [
    'модуль',
    'сторис',
    'экран',
  ]);

  plan(args: readonly string[], { layout }: GenContext): GenPlan {
    const {
      module,
      folder: story,
      name: screen,
      front,
    } = this.input.parse(args, layout, ({ folder }) => {
      if (folder === SHARED_FOLDER) {
        throw this.input.refusal(
          `сторис «${SHARED_FOLDER}» — имя папки занято общими экранами и уведомлениями`,
        );
      }
    });
    const start = new UiNodePlan(SCREEN_NODE, front).plan(story, screen, true);
    const screenDef = new UiNodeSources(SCREEN_NODE, screen, module).defName();
    const sources = new StorySources(story, module);

    return {
      files: [
        ...start.files,
        {
          path: join(front.moduleDir(), story, `${story}.story.ts`),
          content: sources.text(screenDef, `./${screen}.screen`),
        },
      ],
      edits: new PlannedEdits([
        ...start.edits,
        ...new ModuleEdits(front).of(
          sources.defName(),
          sources.defModule(),
          'stories',
        ),
      ]).linked(),
      notes: [
        ...(start.notes ?? []),
        `Подключи ${sources.defName()} к stories приложения UI (*.ui-app.ts) или к leads другой сторис; callers: ['user'] — поправь, если сторис для guest или system.`,
      ],
    };
  }
}
