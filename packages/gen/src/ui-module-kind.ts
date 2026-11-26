import { join } from 'node:path';
import {
  type GenContext,
  GenError,
  type GenPlan,
  type GenProviderKind,
  type PlannedFile,
} from 'dmg-core/gen';
import { FrontLayout } from './front-layout';
import {
  CHANNEL_TECHS,
  CODE_SHELL,
  LOGIC_LAYER,
  UI_LAYER,
} from './front-layout.const';
import type { FrontChannel } from './front-layout.types';
import { RootManifest } from './root-manifest';
import type { TemplatedChannel, UnitPackages } from './ui-module-kind.types';
import { UiModuleSources } from './ui-module-sources';
import { UiName } from './ui-name';

/**
 * `gen ui-module <модуль> [<раннер>…]` — пустой UI-модуль по `layers`
 * проекта: описание, реестр кода, реестры каналов с шаблоном, пакеты единиц
 * и их подключение к раннерам. Каналы — из слоёв `fe-<канал>`; канал без
 * шаблона получает заметку, а не файлы.
 */
export class UiModuleKind implements GenProviderKind {
  readonly name = 'ui-module';
  readonly usage = '<модуль> [<раннер>…]';

  plan(args: readonly string[], { layout }: GenContext): GenPlan {
    const [module, ...runners] = args;
    if (module === undefined) {
      throw new GenError(
        `Для «${this.name}» нужен модуль — ${this.name} ${this.usage}`,
      );
    }
    if (!UiName.isKebab(module)) {
      throw this.refusal(
        `модуль «${module}» — имя в kebab-case (a-z, 0-9, дефисы)`,
      );
    }
    const front = new FrontLayout(layout, module);
    const channels = front.channels();
    if (channels.length === 0) {
      throw this.refusal('в layers нет каналов — нужен слой fe-<канал>');
    }
    this.verifyModule(module, channels);
    const templated = channels.filter(
      (channel): channel is TemplatedChannel => channel.tech !== undefined,
    );
    const units = this.units(front, templated, runners, layout.root);
    const sources = new UiModuleSources(module);
    const packages = units?.packages ?? [];

    return {
      files: [
        ...this.sourceFiles(front, sources, templated),
        ...(units === undefined ? [] : this.packageFiles(sources, units)),
      ],
      edits: [
        {
          path: join(front.uiDir, 'index.ts'),
          marker: '// gen:exports',
          line: sources.exportLine(),
        },
      ],
      dependencies: runners.flatMap((runner) =>
        packages.map((pkg) => ({
          path: join(layout.root, runner, 'package.json'),
          name: pkg.name,
          version: 'workspace:*',
        })),
      ),
      notes: [
        ...this.wiringNotes(front, sources, channels, templated),
        ...(units === undefined
          ? []
          : this.packageNotes(front, units, runners.length > 0)),
      ],
    };
  }

  private refusal(message: string): GenError {
    return new GenError(`${this.name}: ${message}`);
  }

  /** Каталог модуля `<фронт>/<m>` не должен совпасть с `fe-app` и `<канал>-kit` */
  private verifyModule(module: string, channels: FrontChannel[]): void {
    if (module === 'app') {
      throw this.refusal(
        'модуль «app» — каталог совпал бы со слоем fe-app, имя зарезервировано',
      );
    }
    const channel = channels.find(({ name }) => `${name}-kit` === module);
    if (channel !== undefined) {
      throw this.refusal(
        `модуль «${module}» — каталог совпал бы со слоем ${module} канала ${channel.name}, имя занято`,
      );
    }
  }

  /**
   * Пакеты единиц — код модуля и каналы с шаблоном, у слоя которых есть
   * `package`; нет ни одного — undefined. Пакетам нужны пакет описания и
   * строка `dmg-ui` корня, раннеру — хотя бы один пакет.
   */
  private units(
    front: FrontLayout,
    templated: TemplatedChannel[],
    runners: string[],
    root: string,
  ): UnitPackages | undefined {
    const packages = [LOGIC_LAYER, ...templated.map(({ layer }) => layer)]
      .map((layer) => front.packageOf(layer))
      .filter((pkg) => pkg !== undefined);
    const [runner] = runners;
    if (packages.length === 0) {
      if (runner === undefined) return undefined;
      throw this.refusal(
        `раннер «${runner}» — у слоёв модуля нет package, подключать нечего`,
      );
    }
    const ui = front.packageOf(UI_LAYER);
    if (ui === undefined) {
      throw this.refusal(
        'у слоя «ui» нет package — пакеты кода и каналов импортируют описание по имени пакета (layers.ui.package)',
      );
    }
    const manifest = RootManifest.read(root);
    const dmgUi = manifest.dmgUi();
    if (dmgUi === undefined) {
      throw this.refusal(
        'dmg-ui нет в package.json корня (dependencies, devDependencies) — версия для пакетов единиц берётся оттуда',
      );
    }
    return { packages, ui, dmgUi, manifest };
  }

  /** Описание модуля, код модуля и реестры каналов с шаблоном */
  private sourceFiles(
    front: FrontLayout,
    sources: UiModuleSources,
    templated: TemplatedChannel[],
  ): PlannedFile[] {
    const m = front.module;
    return [
      {
        path: join(front.moduleDir(), `${m}.ui-module.ts`),
        content: sources.uiModule(),
      },
      { path: join(front.logicDir, 'index.ts'), content: sources.logicIndex() },
      {
        path: join(front.logicDir, `${m}-codes.ts`),
        content: sources.codes(front.uiImport(front.logicDir)),
      },
      ...templated.flatMap(({ name, dir, tech }) => [
        { path: join(dir, 'index.ts'), content: sources.channelIndex(name) },
        {
          path: join(dir, `${m}-${name}.views.ts`),
          content: sources.views(name, tech, front.uiImport(dir)),
        },
      ]),
    ];
  }

  /** `package.json` и `tsconfig.json` каждого пакета единицы */
  private packageFiles(
    sources: UiModuleSources,
    { packages, ui, dmgUi }: UnitPackages,
  ): PlannedFile[] {
    return packages.flatMap((pkg) => [
      {
        path: join(pkg.dir, 'package.json'),
        content: sources.packageJson(pkg, ui, dmgUi),
      },
      { path: join(pkg.dir, 'tsconfig.json'), content: sources.tsconfig(pkg) },
    ]);
  }

  /** Подключение модуля к набору и реестров к оболочке; каналы без шаблона */
  private wiringNotes(
    front: FrontLayout,
    sources: UiModuleSources,
    channels: FrontChannel[],
    templated: TemplatedChannel[],
  ): string[] {
    const registries = [
      sources.codesName(),
      ...templated.map(({ name }) => sources.viewsName(name)),
    ];
    const shells = [CODE_SHELL, ...templated.map(({ tech }) => tech.shell)];
    const known = UiName.listed(
      [...CHANNEL_TECHS].map(([name, tech]) => `${name} (${tech.factory})`),
    );
    return [
      `Подключи ${sources.defName()} в modules набора UI (${front.fromRoot(front.uiDir)}/<набор>.set.ts).`,
      `Подключи реестры ${registries.join(', ')} к сборкам оболочки (${shells.join(', ')}).`,
      ...channels
        .filter(({ tech }) => tech === undefined)
        .map(
          ({ name }) =>
            `Канал «${name}»: реестр не создан — шаблоны есть для ${known}; канал на базе держит только перекрытия (${sources.overName()}).`,
        ),
    ];
  }

  /** Каталоги пакетов вне `workspaces`, установка и подключение без раннера */
  private packageNotes(
    front: FrontLayout,
    { packages, manifest }: UnitPackages,
    withRunner: boolean,
  ): string[] {
    const notes = packages
      .map((pkg) => front.fromRoot(pkg.dir))
      .filter((dir) => !manifest.covers(dir))
      .map((dir) => `Добавь «${dir}» в workspaces package.json корня.`);
    notes.push(
      'Затем bun install — чтобы пакеты единиц появились в node_modules.',
    );
    if (!withRunner) {
      const names = packages.map((pkg) => pkg.name).join(', ');
      notes.push(
        `Раннер не указан: объяви ${names} (workspace:*) в package.json оболочки — или передай каталог: ${this.name} ${front.module} <раннер>.`,
      );
    }
    return notes;
  }
}
