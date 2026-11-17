import {
  type AnyModuleDef,
  type AnyUseCaseDef,
  type Identified,
  SystemCaller,
} from 'dmg-core';
import { DefIndex } from 'dmg-core/graph';
import { ChatIds } from '../graph/chat-ids';
import type {
  CommunityPort,
  CommunitySignal,
  MessengerPort,
} from '../messenger/messenger.types';
import type { Bound, CommunitiesSpec } from './communities.types';
import type { ChatReactionSpec, ChatSignalSpec } from './community.types';
import { CommunityLog } from './community-log';
import { CommunityManifest } from './community-manifest';
import { CommunityReactions } from './community-reactions';
import { CommunitySignals } from './community-signals';

export type { CommunitiesSpec } from './communities.types';

/**
 * Исполнитель сообщества одного приложения мессенджера (D-UI-59): сигнал
 * (`receive`) вызывает объявленный command UC, реакция (`start`) — событие →
 * query UC → операция порта сообщества. Вызывающий — система от узла, без
 * человека. Манифест, тип UC, `system`, возможности или порт не годятся —
 * бросок при сборке; входы не бросают (ERR-01), лог без данных (ERR-07).
 */
export class Communities<U extends Identified> {
  private readonly app: CommunitiesSpec<U>['app'];
  private readonly signals: CommunitySignals<U>;
  private readonly reactions: CommunityReactions<U> | undefined;
  private readonly index: DefIndex;
  /** Отписка действующего запуска; `undefined` — не запущен. */
  private running: (() => void) | undefined;

  constructor(spec: CommunitiesSpec<U>) {
    const { app, messenger } = spec;
    const manifest = new CommunityManifest(app, spec.community);
    this.app = app;
    this.index = DefIndex.from(app.set.app.modules);
    const { signals, operations } = messenger.capabilities.community;
    for (const { name, uc, signal } of manifest.signals) {
      this.assertUc('сигнал', name, uc, 'command');
      if (!signals.includes(signal)) {
        this.fail(`сигнал ${name}: мессенджер не принимает сигнал ${signal}`);
      }
    }
    for (const { name, uc, operation } of manifest.reactions) {
      this.assertUc('реакция', name, uc, 'query');
      if (!operations.includes(operation)) {
        this.fail(`реакция ${name}: мессенджер не исполняет ${operation}`);
      }
      if (operation === 'inviteLink') {
        this.fail(
          `реакция ${name}: операция inviteLink — не реализовано (DEBT-UI-25)`,
        );
      }
    }
    const log = new CommunityLog(
      spec.context.logger,
      messenger.capabilities.name,
    );
    const ids = new ChatIds(app.set);
    this.signals = new CommunitySignals(
      spec,
      manifest.signals.map((one) => this.bind(one, ids.signal(app, one.name))),
      log,
    );
    this.reactions =
      manifest.reactions.length === 0
        ? undefined
        : new CommunityReactions(
            spec,
            manifest.reactions.map((one) =>
              this.bind(one, ids.reaction(app, one.name)),
            ),
            this.portOf(messenger),
            log,
          );
  }

  /** Внешний вход сигнала мессенджера: не бросает (ERR-01). */
  receive(signal: CommunitySignal): Promise<void> {
    return this.signals.receive(signal);
  }

  /**
   * Подписывает реакции, одна подписка на событие; возвращает отписку.
   * Повторный запуск без остановки — бросок (иначе операции удвоятся).
   */
  start(): () => void {
    if (this.running !== undefined) {
      throw new Error(`Communities: приложение ${this.app.name} уже запущено`);
    }
    const off = this.reactions?.subscribe() ?? (() => undefined);
    const stop = () => {
      if (this.running !== stop) return;
      off();
      this.running = undefined;
    };
    this.running = stop;
    return stop;
  }

  /** Манифест с модулем-владельцем UC и системным вызывающим от узла `node`. */
  private bind<S extends ChatSignalSpec | ChatReactionSpec>(
    spec: S,
    node: string,
  ): Bound<S, U> {
    return {
      spec,
      module: this.moduleOf(spec.uc),
      node,
      caller: new SystemCaller<U>({
        kind: 'app',
        module: this.app.set.name,
        name: node,
      }),
    };
  }

  /** Реакциям нужен порт сообщества. */
  private portOf(messenger: MessengerPort): CommunityPort {
    const port = messenger.community;
    if (port === undefined) {
      this.fail('реакции есть, а у мессенджера нет порта сообщества');
    }
    return port;
  }

  private moduleOf(uc: AnyUseCaseDef): AnyModuleDef {
    const module = this.index.moduleOf(uc);
    // `CommunityManifest` уже проверил: UC — в приложении.
    if (module === undefined) this.fail(`UC ${uc.name} вне приложения`);
    return module;
  }

  /** UC манифеста — нужного типа и с `system` в `callers` (MAN-11). */
  private assertUc(
    what: 'сигнал' | 'реакция',
    name: string,
    uc: AnyUseCaseDef,
    type: 'command' | 'query',
  ): void {
    if (uc.type !== type) {
      this.fail(`${what} ${name}: UC ${uc.name} — не ${type}`);
    }
    if (!uc.callers.includes('system')) {
      this.fail(`${what} ${name}: у UC ${uc.name} нет system в callers`);
    }
  }

  private fail(text: string): never {
    throw new Error(`сообщество приложения ${this.app.name}: ${text}`);
  }
}
