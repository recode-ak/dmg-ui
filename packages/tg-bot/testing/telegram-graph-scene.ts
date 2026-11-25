import type { ArchApp } from 'dmg-core/arch';
import type { GraphContribution, GraphProvider } from 'dmg-core/graph';
import { type AnyUiAppDef, UiAppDef } from 'dmg-ui';
import {
  type ChatAppSpec,
  type ChatEntryPointSpec,
  ChatGraphProvider,
  DIALOG_CHANNEL,
  type MessengerCapabilities,
} from 'dmg-ui/chat-ui';
import { ExampleDialogUiAppDef } from 'dmg-ui/chat-ui/testing';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  FinishTasksStoryDef,
  FollowAssignedStoryDef,
  PlanTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { UiScene } from 'dmg-ui/testing/fixtures';
import { TELEGRAM_CAPABILITIES, TelegramGraphProvider } from 'dmg-ui/tg-bot';

// Сцены графа Telegram для тестов правил TG и поставщика (в `index.ts` не
// экспортируются): сцена без домена, поставщик `dmg-ui`, общая часть
// мессенджеров `ChatGraphProvider` и `TelegramGraphProvider`; приложение —
// `exampleDialog` на возможностях Telegram.

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
  const app = spec.app ?? ExampleDialogUiAppDef;
  const apps: readonly ChatAppSpec[] = spec.bare
    ? []
    : [
        {
          app,
          capabilities: spec.capabilities ?? TELEGRAM_CAPABILITIES,
          entryPoints: spec.entryPoints,
          ...(spec.community ? { community: spec.community } : {}),
        },
      ];
  return UiScene.appOf(
    ExampleUiSetDef,
    [app],
    [
      new ChatGraphProvider({ apps }),
      new TelegramGraphProvider(),
      ...(spec.extra ?? []),
    ],
  );
};

/**
 * Точка входа меню «Начать работу» приложения `exampleDialog`: ссылкой — в
 * счёт команд и меню не идёт. Без неё у входа `menu` нет точки (CH-02).
 */
export const MENU_POINT = { entry: 'menu', via: 'link', key: 'menu' } as const;

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
