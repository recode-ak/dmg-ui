import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GetTaskUcDef,
  RemoveUserUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import type { CommunityOperation, CommunitySignalKind } from 'dmg-ui/chat-ui';
import { MemoryMessenger } from 'dmg-ui/chat-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  MENU_POINT,
  stubProvider,
  telegramScene,
} from '../../testing/telegram-graph-scene';
import { TELEGRAM_PROVIDER, TELEGRAM_VERSION } from './telegram-graph.const';
import { TelegramGraphProvider } from './telegram-graph-provider';

// Поставщик графа Telegram: `dmg-ui-tg`, без своих видов и
// вклада — читает узлы `chatEntryPoint` и рёбра `chatOpens` общей части
// мессенджеров, свои шесть правил TG-01…TG-06 ставит в области приложений
// UI с мессенджером `telegram`. Сами правила — в `rules/*.rule.test.ts`.

/** Четыре точки: `/start`, меню и ссылка на вход `assigned`, ссылка на меню «Начать работу». */
const POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'assigned', via: 'menu', key: 'assigned' },
  { entry: 'assigned', via: 'link', key: 'assigned' },
  MENU_POINT,
];

/** Строки правил TG отчёта. */
const tg = (report: ArchReport) =>
  report.lines.filter((line) => line.startsWith('TG-'));

describe('TelegramGraphProvider', () => {
  test('имя dmg-ui-tg, версия равна version из package.json', () => {
    const file = join(import.meta.dir, '../../../../package.json');
    const { version } = v.parse(
      v.object({ version: v.string() }),
      JSON.parse(readFileSync(file, 'utf8')),
    );
    const provider = new TelegramGraphProvider();

    expect(TELEGRAM_PROVIDER).toBe('dmg-ui-tg');
    expect(provider.name).toBe('dmg-ui-tg');
    expect(provider.version).toBe(version);
    expect(TELEGRAM_VERSION).toBe(version);
  });

  test('kinds() и contribute() пусты: вид chatEntryPoint повторно не регистрируется', () => {
    const provider = new TelegramGraphProvider();

    expect(provider.kinds()).toEqual({ nodes: [], edges: [] });
    expect(provider.contribute()).toEqual({ nodes: [], edges: [] });
  });

  test('rules() — ровно TG-01…TG-06 по порядку', () => {
    const rules = new TelegramGraphProvider().rules?.() ?? [];

    expect(rules.map((rule) => rule.id)).toEqual([
      'TG-01',
      'TG-02',
      'TG-03',
      'TG-04',
      'TG-05',
      'TG-06',
    ]);
  });

  test('приложение Telegram с тремя точками (command, menu, link) вместе с ChatGraphProvider — arch:check без нарушений', () => {
    const report = ArchReport.of(telegramScene({ entryPoints: POINTS }));

    expect(report.lines).toEqual([
      'arch:check example: нарушений — 0',
      'arch:check: нарушений нет',
    ]);
    expect(report.code).toBe(0);
  });
});

describe('TG-01…TG-06: область — приложения с мессенджером telegram', () => {
  test('приложение с возможностями не telegram и via «message» — ни одной строки TG', () => {
    const report = ArchReport.of(
      telegramScene({
        capabilities: MemoryMessenger.editing().capabilities,
        entryPoints: [
          { entry: 'start', via: 'message', key: 'Start' },
          { entry: 'assigned', via: 'message', key: 'assigned' },
          { entry: 'menu', via: 'message', key: 'menu' },
        ],
      }),
    );

    expect(tg(report)).toEqual([]);
    expect(report.code).toBe(0);
  });

  test('приложение без узла chatMessenger в графе — правила молчат без броска', () => {
    const report = ArchReport.of(
      telegramScene({
        bare: true,
        entryPoints: [],
        extra: [
          stubProvider({
            nodes: [
              {
                kind: 'chatEntryPoint',
                id: 'exampleDialog/point-scene',
                label: 'Точка сцены',
                description: 'Точка входа подставного поставщика.',
                props: { entry: 'assigned', via: 'message', key: 'Bad Key' },
              },
            ],
            edges: [],
          }),
        ],
      }),
    );

    expect(tg(report)).toEqual([]);
  });
});

// Критерий 7: реакция в приложении, которое её не умеет, — CH-03 общей части
// (сам CH-03 здесь не перепроверяется — TST-08). Telegram объявляет пять
// сигналов и операции `exclude`, `approve`; `invite` — нет.

/** Сигнал вида `signal` → `removeUser`. */
const signalOf = (name: string, signal: CommunitySignalKind) =>
  ({
    name,
    label: `Сигнал ${name}`,
    description: `Сигнал ${signal} из Telegram.`,
    signal,
    uc: RemoveUserUcDef,
    input: { userId: 'person' },
  }) as const;

/** Реакция на `todo.task.assigned`: `getTask` → операция `operation` над владельцем задачи. */
const reactionOf = (name: string, operation: CommunityOperation) =>
  ({
    name,
    label: `Реакция ${name}`,
    description: `Операция ${operation} над владельцем назначенной задачи.`,
    event: TaskEvents.assigned,
    uc: GetTaskUcDef,
    input: { taskId: 'taskId' },
    operation,
    targets: { community: 'uuid', person: 'ownerId' },
  }) as const;

describe('сообщество в приложении Telegram: CH-03', () => {
  test('реакция invite — строка CH-03 о реакции: мессенджер telegram её не исполняет', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: POINTS,
        community: { reactions: [reactionOf('ask', 'invite')] },
      }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('CH-03')).toEqual([
      'CH-03: приложение exampleDialog: реакция exampleDialog/reaction-ask (invite) — мессенджер telegram её не исполняет',
    ]);
  });

  test('реакции exclude, approve и все пять сигналов — нарушений нет', () => {
    const report = ArchReport.of(
      telegramScene({
        entryPoints: POINTS,
        community: {
          signals: [
            signalOf('came', 'joined'),
            signalOf('gone', 'left'),
            signalOf('added', 'added'),
            signalOf('removed', 'removed'),
            signalOf('asked', 'requested'),
          ],
          reactions: [
            reactionOf('drop', 'exclude'),
            reactionOf('let', 'approve'),
          ],
        },
      }),
    );

    expect(report.rule('CH-03')).toEqual([]);
    expect(report.code).toBe(0);
  });
});
