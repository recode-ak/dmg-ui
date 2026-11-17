import type { ArchApp } from 'dmg-core/arch';
import type { GraphContribution, GraphProvider } from 'dmg-core/graph';
import { ExampleArch } from 'dmg-core/testing';
import { type AnyUiAppDef, UiAppDef } from 'dmg-ui';
import {
  type ChatAppSpec,
  type ChatEntryPointSpec,
  ChatExamples,
  ChatGraphProvider,
  DIALOG_CHANNEL,
  type MessengerCapabilities,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  exampleCodes,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { TELEGRAM_CAPABILITIES, TelegramGraphProvider } from 'dmg-ui/tg-bot';

// Сцены графа Telegram для тестов правил TG и поставщика (в `index.ts` не
// экспортируются): домен примера, поставщик `dmg-ui`, общая часть
// мессенджеров `ChatGraphProvider` и `TelegramGraphProvider`; приложение —
// `exampleDialog` на возможностях Telegram.

/** Примеры учебного набора для CH-01: собираются до графа (`await` на верхнем уровне). */
const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/** Сцена графа Telegram. */
export type TelegramSceneSpec = {
  readonly entryPoints: readonly ChatEntryPointSpec[];
  /** Приложение UI; по умолчанию — `exampleDialog` учебного примера. */
  readonly app?: AnyUiAppDef;
  /** Возможности мессенджера приложения; по умолчанию — `TELEGRAM_CAPABILITIES`. */
  readonly capabilities?: MessengerCapabilities;
  readonly community?: ChatAppSpec['community'];
  /** Приложения общей части без приложения Telegram: сцена без узла `chatMessenger`. */
  readonly bare?: boolean;
  /** Подставные поставщики сцены (узлы и рёбра видов `dmg-ui-chat`). */
  readonly extra?: readonly GraphProvider[];
};

/** Сцена `arch:check`: `exampleDialog` в мессенджере и оба поставщика — `dmg-ui-chat` и `dmg-ui-tg`. */
export const telegramScene = (spec: TelegramSceneSpec): ArchApp => {
  const app = spec.app ?? ExampleDialogAppDef;
  const apps: readonly ChatAppSpec[] = spec.bare
    ? []
    : [
        {
          app,
          views: exampleDialogViews,
          capabilities: spec.capabilities ?? TELEGRAM_CAPABILITIES,
          entryPoints: spec.entryPoints,
          ...(spec.community ? { community: spec.community } : {}),
        },
      ];
  return {
    ...ExampleArch,
    providers: [
      new UiGraphProvider({ set: ExampleUiSetDef, apps: [app] }),
      new ChatGraphProvider({ apps, examples: EXAMPLES }),
      new TelegramGraphProvider(),
      ...(spec.extra ?? []),
    ],
  };
};

/** Подставной поставщик сцены без своих видов: только узлы и рёбра. */
export const stubProvider = (
  contribution: GraphContribution,
): GraphProvider => ({
  name: 'scene-stub',
  version: '1.0.0',
  kinds: () => ({ nodes: [], edges: [] }),
  contribute: () => contribution,
});

/** Названия входов `start` и `assigned` приложения сцены. */
export type SceneLabels = {
  readonly start?: string;
  readonly assigned?: string;
};

/** Приложение `exampleDialog` с заданными названиями входов; `entries: false` — без входов. */
export const sceneApp = (labels: SceneLabels | false = {}): AnyUiAppDef =>
  UiAppDef.define({
    name: 'exampleDialog',
    label: 'Учебное приложение в диалоге',
    description: 'Приложение UI учебного примера для сцен правил Telegram.',
    set: ExampleUiSetDef,
    channel: DIALOG_CHANNEL,
    stories: [PlanTasksStoryDef, FinishTasksStoryDef, FollowAssignedStoryDef],
    notifications: [TaskAssignedNotificationDef, TaskCompletedNotificationDef],
    entries:
      labels === false
        ? {}
        : {
            start: {
              label: labels.start ?? 'Мои задачи',
              description: 'Список своих задач с начала.',
              address: TaskListScreenDef.at({ page: 0 }),
            },
            assigned: {
              label: labels.assigned ?? 'Назначенные мне',
              description: 'Задачи, которые поручили вызывающему.',
              address: AssignedTasksScreenDef.at({}),
            },
          },
  });
