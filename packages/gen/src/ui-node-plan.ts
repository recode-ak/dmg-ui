import { join } from 'node:path';
import type { GenPlan, PlannedEdit, PlannedFile } from 'dmg-core/gen';
import { DMG_UI } from './dmg-ui.const';
import type { FrontLayout } from './front-layout';
import { CHANNEL_TECHS } from './front-layout.const';
import type { FrontChannel } from './front-layout.types';
import { LineWidth } from './line-width';
import { MarkerIndent } from './marker-indent';
import { ModuleEdits } from './module-edits';
import { PlannedEdits } from './planned-edits';
import type { TemplatedChannel } from './ui-module-kind.types';
import { UiName } from './ui-name';
import { SHARED_FOLDER } from './ui-node.const';
import type { UiNodeSpec } from './ui-node.types';
import { UiNodeSources } from './ui-node-sources';

/**
 * Общий построитель плана узла модуля — экрана или уведомления: манифест в
 * описании, код в `logic`, представление в каждом канале с шаблоном, по
 * одному пути `<папка>/<имя>` в трёх деревьях. Различия видов — в `UiNodeSpec`.
 */
export class UiNodePlan {
  private readonly width = new LineWidth();
  private readonly indent = new MarkerIndent();

  constructor(
    private readonly spec: UiNodeSpec,
    private readonly front: FrontLayout,
  ) {}

  /**
   * План узла `<папка>/<имя>`; start — экран `start` сторис: правок файла
   * сторис и заметок о переходе у него нет, шаблон сторис уже содержит его.
   */
  plan(folder: string, node: string, start = false): GenPlan {
    const { front, spec } = this;
    const m = front.module;
    const sources = new UiNodeSources(spec, node, m);
    const channels = front.channels();
    const templated = channels.filter(
      (channel): channel is TemplatedChannel => channel.tech !== undefined,
    );
    const defPath = join(front.moduleDir(), folder, `${node}.${spec.kind}.ts`);
    const files: PlannedFile[] = [
      { path: defPath, content: sources.def() },
      {
        path: join(front.logicDir, folder, `${node}.${spec.codeSuffix}.ts`),
        content: sources.code(front.uiImport(join(front.logicDir, folder))),
      },
      ...templated.map(({ dir, tech }) => ({
        path: join(dir, folder, `${node}.view.ts`),
        content: sources.view(tech, front.uiImport(join(dir, folder))),
      })),
    ];
    return {
      files,
      edits: new PlannedEdits([
        ...new ModuleEdits(front).of(
          sources.defName(),
          sources.defModule(folder),
          spec.list,
        ),
        ...(start ? [] : this.storyEdits(sources, folder)),
        ...this.codeEdits(sources, folder),
        ...templated.flatMap((channel) =>
          this.viewEdits(sources, folder, channel),
        ),
      ]).linked(),
      notes: this.notes(sources, folder, channels, defPath, start),
    };
  }

  /** Сторис папки: импорт экрана и элемент `screens`; для узла в `shared` и уведомления — нет */
  private storyEdits(sources: UiNodeSources, folder: string): PlannedEdit[] {
    if (this.spec.kind !== 'screen' || folder === SHARED_FOLDER) return [];
    const path = join(this.front.moduleDir(), folder, `${folder}.story.ts`);
    return [
      {
        path: path,
        marker: '// gen:imports',
        line: this.width.importOf(
          sources.defName(),
          `./${sources.node}.screen`,
        ),
      },
      {
        path: path,
        marker: '// gen:screens',
        line: sources.item(
          sources.defName(),
          this.indent.of(path, '// gen:screens', 4),
        ),
      },
    ];
  }

  /** Реестр кода модуля: импорты `CodeLoader` и описания, загрузчик */
  private codeEdits(sources: UiNodeSources, folder: string): PlannedEdit[] {
    const { front } = this;
    const path = join(front.logicDir, `${front.module}-codes.ts`);
    return [
      {
        path,
        marker: '// gen:imports',
        line: this.width.importOf('CodeLoader', DMG_UI),
      },
      {
        path,
        marker: '// gen:imports',
        line: this.width.importOf(
          sources.defName(),
          front.uiImport(front.logicDir),
        ),
      },
      {
        path,
        marker: '// gen:codes',
        line: sources.loader(folder, this.indent.of(path, '// gen:codes', 4)),
      },
    ];
  }

  /** Реестр представлений канала: импорт представления и элемент */
  private viewEdits(
    sources: UiNodeSources,
    folder: string,
    { name, dir }: TemplatedChannel,
  ): PlannedEdit[] {
    const path = join(dir, `${this.front.module}-${name}.views.ts`);
    return [
      {
        path: path,
        marker: '// gen:imports',
        line: this.width.importOf(
          sources.viewName(),
          sources.viewModule(folder),
        ),
      },
      {
        path: path,
        marker: '// gen:views',
        line: sources.item(
          sources.viewName(),
          this.indent.of(path, '// gen:views', 2),
        ),
      },
    ];
  }

  /** Заметки по порядку: shared, каналы без шаблона, переход из сторис, файл описания */
  private notes(
    sources: UiNodeSources,
    folder: string,
    channels: FrontChannel[],
    defPath: string,
    start: boolean,
  ): string[] {
    const { spec } = this;
    const def = sources.defName();
    const shared = folder === SHARED_FOLDER;
    const own = [
      shared ? spec.sharedNote?.(def) : undefined,
      ...this.channelNotes(channels),
      shared || start ? undefined : spec.storyNote?.(def),
      spec.fileNote?.(this.front.fromRoot(defPath)),
    ];
    return own.filter((note) => note !== undefined);
  }

  /** Каналов нет или канал без шаблона — представления не созданы */
  private channelNotes(channels: FrontChannel[]): string[] {
    if (channels.length === 0) {
      return ['Каналов в layers нет: представления не созданы.'];
    }
    const known = UiName.listed([...CHANNEL_TECHS.keys()]);
    return channels
      .filter(({ tech }) => tech === undefined)
      .map(
        ({ name }) =>
          `Канал «${name}»: представление не создано — шаблоны есть для ${known}; канал на базе держит только перекрытия.`,
      );
  }
}
