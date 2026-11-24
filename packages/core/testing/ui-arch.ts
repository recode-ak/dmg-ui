import type { AnyUseCaseDef } from 'dmg-core';
import { type ArchApp, reportArchCheck } from 'dmg-core/arch';
import type { GraphProvider } from 'dmg-core/graph';
import { ExampleAppDef } from 'dmg-core/testing';
import { ListTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import * as v from 'valibot';
import { Address } from '../src/address/address';
import { UiGraphProvider } from '../src/graph/ui-graph-provider';
import {
  type AnyNotificationDef,
  NotificationDef,
  type NotificationSpec,
} from '../src/manifest/notification-def';
import {
  type ActionSpec,
  type AnyScreenDef,
  ScreenDef,
  type ScreenExampleSpec,
  type ScreenSpec,
} from '../src/manifest/screen-def';
import type { ScreenExit } from '../src/manifest/screen-exit';
import {
  type AnyStoryDef,
  type OutcomeSpec,
  StoryDef,
  type StorySpec,
} from '../src/manifest/story-def';
import {
  type AnyUiAppDef,
  type EntrySpec,
  UiAppDef,
} from '../src/manifest/ui-app-def';
import { UiModuleDef } from '../src/manifest/ui-module-def';
import { type AnyUiSetDef, UiSetDef } from '../src/manifest/ui-set-def';

// Помощники тестов правил графа: сборка `ArchApp` сцены без домена — учебное
// приложение, поставщик `dmg-ui` и каталог сцены без файлов домена — и прогон
// `reportArchCheck` (в `testing/index.ts` не экспортируются).

/** Каталог сцены: `ArchApp.project` сцен, внутри — только вход графа. */
const SCENE_DIR = `${import.meta.dir}/scene`;

/** Отчёт `arch:check`: код выхода и строки; `rule` — строки одного правила. */
export class ArchReport {
  constructor(
    readonly code: number,
    readonly lines: readonly string[],
  ) {}

  static of(app: ArchApp): ArchReport {
    const lines: string[] = [];
    const code = reportArchCheck([app], (line) => {
      lines.push(line);
    });
    return new ArchReport(code, lines);
  }

  /** Строки вида `<ID>: …` для правила `id`. */
  rule(id: string): string[] {
    return this.lines.filter((line) => line.startsWith(`${id}: `));
  }
}

/** Части минимальной сцены: экраны, сторис, уведомления и их состав в приложении UI. */
export type SceneParts = {
  readonly screens: readonly AnyScreenDef[];
  readonly stories?: readonly AnyStoryDef[];
  readonly notifications?: readonly AnyNotificationDef[];
  /** Сторис приложения UI; по умолчанию — все сторис набора. */
  readonly appStories?: readonly AnyStoryDef[];
  /** Уведомления приложения UI; по умолчанию — все уведомления набора. */
  readonly appNotifications?: readonly AnyNotificationDef[];
  /** Входы приложения UI; по умолчанию — один, на первый экран. */
  readonly entries?: Readonly<Record<string, EntrySpec>>;
};

/**
 * Минимальный набор `miniUi` (модуль `todo`) и приложение UI `miniConsole`
 * поверх учебного домена. Конструкторы Def заполняют всё, что правилам не
 * важно, чтобы тест правила называл только то, что нарушает правило.
 */
export class UiScene {
  readonly set: AnyUiSetDef;
  readonly app: AnyUiAppDef;

  constructor(parts: SceneParts) {
    const stories = parts.stories ?? [];
    const notifications = parts.notifications ?? [];
    this.set = UiSetDef.define({
      name: 'miniUi',
      label: 'Минимальный набор',
      description: 'Набор UI одной сцены теста.',
      app: ExampleAppDef,
      modules: [
        UiModuleDef.define({
          name: 'todo',
          label: 'Задачи',
          description: 'Модуль сцены.',
          screens: parts.screens,
          stories,
          notifications,
        }),
      ],
    });
    const first = parts.screens[0];
    this.app = UiAppDef.define({
      name: 'miniConsole',
      label: 'Минимальное приложение',
      description: 'Приложение UI одной сцены теста.',
      set: this.set,
      channel: 'mini-channel',
      stories: parts.appStories ?? stories,
      notifications: parts.appNotifications ?? notifications,
      entries: parts.entries ?? (first ? { start: UiScene.entry(first) } : {}),
    });
  }

  /** Экран с заполненными текстами, чтением `listTasks` и пустыми данными. */
  static screen(name: string, over: Partial<ScreenSpec> = {}): ScreenDef {
    return new ScreenDef<ScreenSpec>({
      label: `Экран ${name}`,
      description: `Описание экрана ${name}.`,
      reads: [ListTasksUcDef],
      data: v.object({}),
      ...over,
      name,
    });
  }

  /** Сторис с первым экраном в старте, вызывающим `user` и пустыми исходами. */
  static story(
    name: string,
    screens: readonly AnyScreenDef[],
    over: Partial<StorySpec> = {},
  ): StoryDef {
    const start = screens[0];
    if (!start) throw new Error(`Сторис ${name}: нужен хотя бы один экран`);
    return StoryDef.define({
      label: `Сторис ${name}`,
      description: `Описание сторис ${name}.`,
      callers: ['user'],
      goal: 'чтобы проверить правило',
      start,
      screens,
      outcomes: {},
      ...over,
      name,
    });
  }

  /** Уведомление о назначении задачи с получателем из payload и чтением `listTasks`. */
  static notification(
    name: string,
    over: Partial<NotificationSpec> = {},
  ): AnyNotificationDef {
    return NotificationDef.define({
      label: `Уведомление ${name}`,
      description: `Описание уведомления ${name}.`,
      event: TaskEvents.assigned,
      recipients: { from: 'payload', fields: ['assigneeId'] },
      reads: [ListTasksUcDef],
      data: v.object({}),
      ...over,
      name,
    });
  }

  /** Действие-переход на экраны `to`. */
  static jump(...to: readonly AnyScreenDef[]): ActionSpec {
    return {
      label: 'Перейти',
      description: 'Переход на другой экран.',
      to: () => to,
    };
  }

  /** Действие, вызывающее UC. */
  static call(uc: AnyUseCaseDef): ActionSpec {
    return { label: 'Вызвать', description: 'Вызов UC.', uc };
  }

  /** Выход экрана по имени; нет выхода — ошибка теста. */
  static exit(screen: AnyScreenDef, name: string): ScreenExit {
    const exit = screen.exits[name];
    if (!exit) throw new Error(`У экрана ${screen.name} нет выхода ${name}`);
    return exit;
  }

  /** Экран с выходом `done`: его исходы сторис называют цель выхода. */
  static exiting(name: string, over: Partial<ScreenSpec> = {}): ScreenDef {
    return UiScene.screen(name, {
      exits: { done: { label: 'Готово', description: 'Работа окончена.' } },
      ...over,
    });
  }

  /** Исход сторис по выходу `done` экрана; `after` — цель исхода, без неё — умолчание. */
  static outcome(
    screen: AnyScreenDef,
    after?: 'back' | 'home' | Address,
  ): OutcomeSpec {
    return {
      label: 'Работа окончена',
      description: 'Исход по выходу экрана.',
      exits: [UiScene.exit(screen, 'done')],
      ...(after === undefined ? {} : { after }),
    };
  }

  /** Пример экрана с данными, не зависящими от схем. */
  static example(
    params: unknown,
    data: unknown,
    state?: unknown,
  ): ScreenExampleSpec {
    return {
      label: 'Пример',
      description: 'Пример экрана.',
      params,
      data,
      ...(state === undefined ? {} : { state }),
    };
  }

  /** Вход приложения UI на экран с параметрами. */
  static entry(screen: AnyScreenDef, params: unknown = {}): EntrySpec {
    return {
      label: 'Вход',
      description: `Вход на экран ${screen.name}.`,
      address: new Address(screen, params),
    };
  }

  /**
   * Схема, которую тип не пускает в поле (`v.object` в `params`, не объект во
   * входе): правило ловит ровно то, что компилятор запретил бы.
   */
  static bypass<T>(schema: v.GenericSchema): T {
    return schema as unknown as T;
  }

  /**
   * Приложение для `arch:check` без домена: учебное приложение, поставщик
   * `dmg-ui` без каналов и чужие поставщики; проект — каталог сцены без
   * раннеров. Каталоги слоёв фронта — ключи без каталогов на диске: слою
   * нужен ключ (иначе ARC-13), файлов фронта у сцены нет.
   */
  static appOf(
    set: AnyUiSetDef,
    apps: readonly AnyUiAppDef[],
    providers: readonly GraphProvider[] = [],
  ): ArchApp {
    return {
      def: ExampleAppDef,
      providers: [
        new UiGraphProvider({ set, apps, channels: [] }),
        ...providers,
      ],
      project: SCENE_DIR,
      runners: [],
      layers: {
        ui: [`${SCENE_DIR}/platform/ui`],
        'fe-app': [`${SCENE_DIR}/frontend/app`],
        'fe-logic': [`${SCENE_DIR}/frontend/{m}/logic`],
      },
      graphEntry: `${SCENE_DIR}/scene-entry.ts`,
    };
  }

  /** Приложение сцены; `providers` — чужие поставщики сверх `dmg-ui`. */
  arch(providers: readonly GraphProvider[] = []): ArchApp {
    return UiScene.appOf(this.set, [this.app], providers);
  }

  report(providers: readonly GraphProvider[] = []): ArchReport {
    return ArchReport.of(this.arch(providers));
  }
}
