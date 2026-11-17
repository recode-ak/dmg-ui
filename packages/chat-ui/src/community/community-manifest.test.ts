import { describe, expect, test } from 'bun:test';
import { EventDef, UseCaseDef } from 'dmg-core';
import {
  GetTaskUcDef,
  ListTasksUcDef,
  RemoveUserUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import * as v from 'valibot';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../testing';
import { ChatExamples } from '../graph/chat-examples';
import { ChatGraphProvider } from '../graph/chat-graph-provider';
import type { ChatCommunitySpec } from './community.types';
import { CommunityManifest } from './community-manifest';

// Проверка манифестов сообщества при сборке: одна на поставщика
// графа и исполнителя — оба бросают одним текстом. Бросок: имя сигнала или
// реакции повторено в приложении или не сегмент `GraphId`; UC или событие
// вне приложения (`DefIndex` модулей приложения); пустые `input` или
// `targets`. Текст — имя приложения и манифеста, без значений манифеста.

const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/** Сигнал `left` → `removeUser`. */
const GONE = {
  name: 'gone',
  label: 'Участник вышел',
  description: 'Участник вышел из группы — учётная запись удаляется.',
  signal: 'left',
  uc: RemoveUserUcDef,
  input: { userId: 'person' },
} as const;

/** Реакция на `todo.task.assigned`: `getTask` → исключить владельца задачи. */
const DROP = {
  name: 'drop',
  label: 'Исключить владельца',
  description: 'Владелец назначенной задачи исключается из группы.',
  event: TaskEvents.assigned,
  uc: GetTaskUcDef,
  input: { taskId: 'taskId' },
  operation: 'exclude',
  targets: { community: 'uuid', person: 'ownerId' },
} as const;

/** UC вне модулей учебного приложения. */
const strayUc = (type: 'command' | 'query') =>
  UseCaseDef.define({
    name: type === 'command' ? 'strayCommand' : 'strayQuery',
    label: 'Чужой UC',
    description: 'UC, которого нет ни в одном модуле приложения.',
    type,
    aggregate: ListTasksUcDef.aggregate,
    callers: ['system'],
    policy: ListTasksUcDef.policy,
    input: v.object({}),
    output: v.object({}),
    errors: [],
  });

/** Событие вне агрегатов учебного приложения. */
const StrayEvents = EventDef.define('stray.thing', {
  happened: {
    label: 'Чужое событие',
    description: 'Событие, которого нет ни в одном агрегате приложения.',
    payload: v.object({}),
  },
});

/** Текст броска сборки; не бросило — пустая строка. */
const thrown = (build: () => unknown): string => {
  try {
    build();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
};

const manifestOf = (community: ChatCommunitySpec) => () =>
  new CommunityManifest(ExampleDialogAppDef, community);

const providerOf = (community: ChatCommunitySpec) => () =>
  new ChatGraphProvider({
    apps: [
      {
        app: ExampleDialogAppDef,
        views: exampleDialogViews,
        capabilities: MemoryMessenger.editing().capabilities,
        community,
      },
    ],
    examples: EXAMPLES,
  });

type Broken = {
  /** Что сломано — часть имени теста. */
  readonly what: string;
  readonly community: ChatCommunitySpec;
  /** Имя манифеста, которое должно быть в тексте броска. */
  readonly name: string;
};

const BROKEN: readonly Broken[] = [
  {
    what: 'имя сигнала повторено в приложении',
    community: { signals: [GONE, { ...GONE, signal: 'joined' }] },
    name: 'gone',
  },
  {
    what: 'имя реакции повторено в приложении',
    community: { reactions: [DROP, { ...DROP, operation: 'invite' }] },
    name: 'drop',
  },
  {
    what: 'имя сигнала не сегмент GraphId',
    community: { signals: [{ ...GONE, name: 'gone/away' }] },
    name: 'gone/away',
  },
  {
    what: 'имя реакции не сегмент GraphId',
    community: { reactions: [{ ...DROP, name: '-drop' }] },
    name: '-drop',
  },
  {
    what: 'UC сигнала вне приложения',
    community: { signals: [{ ...GONE, uc: strayUc('command') }] },
    name: 'gone',
  },
  {
    what: 'UC реакции вне приложения',
    community: { reactions: [{ ...DROP, uc: strayUc('query') }] },
    name: 'drop',
  },
  {
    what: 'событие реакции вне приложения',
    community: { reactions: [{ ...DROP, event: StrayEvents.happened }] },
    name: 'drop',
  },
  {
    what: 'пустой input сигнала',
    community: { signals: [{ ...GONE, input: {} }] },
    name: 'gone',
  },
  {
    what: 'пустой input реакции',
    community: { reactions: [{ ...DROP, input: {} }] },
    name: 'drop',
  },
  {
    what: 'пустое поле сообщества в targets реакции',
    community: {
      reactions: [{ ...DROP, targets: { community: '', person: 'ownerId' } }],
    },
    name: 'drop',
  },
  {
    what: 'пустое поле человека в targets реакции',
    community: {
      reactions: [{ ...DROP, targets: { community: 'uuid', person: '' } }],
    },
    name: 'drop',
  },
];

/** Значения манифестов сцены — их нет в тексте броска. */
const VALUES = [GONE.label, GONE.description, DROP.label, DROP.description];

describe('CommunityManifest — манифест по правилам', () => {
  test('сигнал и реакция по правилам — сборка не бросает', () => {
    expect(thrown(manifestOf({ signals: [GONE], reactions: [DROP] }))).toBe('');
  });

  test('пустой манифест и манифест без списков — сборка не бросает', () => {
    expect(thrown(manifestOf({}))).toBe('');
    expect(thrown(manifestOf({ signals: [], reactions: [] }))).toBe('');
  });

  test('UC и событие из модулей приложения по dependsOn — сборка не бросает', () => {
    expect(
      thrown(
        manifestOf({
          signals: [GONE, { ...GONE, name: 'came', signal: 'joined' }],
          reactions: [DROP, { ...DROP, name: 'ask', operation: 'invite' }],
        }),
      ),
    ).toBe('');
  });
});

describe('CommunityManifest — ошибки сборки', () => {
  for (const { what, community, name } of BROKEN) {
    test(`${what} — бросок с именем приложения и манифеста, без значений`, () => {
      const message = thrown(manifestOf(community));

      expect(message).not.toBe('');
      expect(message).toContain('exampleDialog');
      expect(message).toContain(name);
      for (const value of VALUES) expect(message).not.toContain(value);
    });
  }
});

describe('ChatGraphProvider — манифест сообщества проверяет CommunityManifest', () => {
  for (const { what, community } of BROKEN) {
    test(`${what} — поставщик бросает тем же текстом, что CommunityManifest`, () => {
      const expected = thrown(manifestOf(community));

      expect(expected).not.toBe('');
      expect(thrown(providerOf(community))).toBe(expected);
    });
  }

  test('манифест по правилам — поставщик не бросает', () => {
    expect(thrown(providerOf({ signals: [GONE], reactions: [DROP] }))).toBe('');
  });
});
