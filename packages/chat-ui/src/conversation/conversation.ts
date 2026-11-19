import type { Trace } from 'dmg-core';
import {
  type ActionField,
  type ActionView,
  type AnyUiAppDef,
  type InstanceJson,
  type LocalView,
  ScreenHelp,
  type ScreenInstance,
} from 'dmg-ui';
import type { DeliveredNotification } from 'dmg-ui/server';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { HelpText } from '../view/help-text';
import { ScreenComposer } from '../view/screen-composer';
import {
  CONVERSATION_TEXTS,
  MAX_PEER_LENGTH,
  MAX_REF_LENGTH,
  MAX_SIGNAL_ID,
  MAX_SIGNAL_TEXT,
  MIN_OPTIONS,
} from './conversation.const';
import type {
  ConversationSignal,
  ConversationSnapshot,
  ConversationSpec,
  RefEntry,
} from './conversation.types';
import { ConversationInput } from './conversation-input';
import { ConversationLog } from './conversation-log';
import { ConversationNotices } from './conversation-notices';
import { ConversationOutcomes } from './conversation-outcomes';
import { ConversationOutput } from './conversation-output';
import { ConversationPath } from './conversation-path';
import { ConversationQueue } from './conversation-queue';
import { ConversationReplies } from './conversation-replies';
import { ConversationScreens } from './conversation-screens';
import { ExitHandoff } from './exit-handoff';
import { OptionLayout } from './option-layout';
import { RefTable } from './ref-table';
import { SeenIds } from './seen-ids';

/**
 * Беседа одного собеседника (D-UI-43, D-UI-107): сигналы мессенджера и
 * проактивные показы идут по одному через очередь, повтор id отсеивается,
 * нажатие разбирается по записи таблицы ссылок, вход действия с полями
 * собирает черновик, исходы ядра — по таблице политик (гайд
 * `channel-package.md`), «Назад» — по пути переходов беседы, справка —
 * заметкой по виду живого экрана.
 *
 * @see conversation.test.ts
 */
export class Conversation {
  private readonly spec: ConversationSpec;
  private readonly queue = new ConversationQueue();
  private readonly refs: RefTable;
  private readonly seen: SeenIds;
  private readonly notices: ConversationNotices;
  private readonly replies: ConversationReplies;
  private readonly log: ConversationLog;
  private readonly output: ConversationOutput;
  private readonly path: ConversationPath;
  private readonly screens: ConversationScreens;
  private readonly input: ConversationInput;
  private readonly outcomes: ConversationOutcomes;
  private readonly help: ScreenHelp;
  private closed = false;

  /** Возможности не годятся (`options.max < 3`, `options.ref < 16`) или нет входа home — бросок. */
  constructor(spec: ConversationSpec, snapshot?: ConversationSnapshot) {
    Conversation.assertFits(spec.app, spec.home, spec.messenger.capabilities);
    this.spec = spec;
    this.help = new ScreenHelp(spec.app);
    this.refs = new RefTable(spec.epochs(), snapshot?.refs);
    this.seen = new SeenIds(snapshot?.seen);
    this.path = new ConversationPath(snapshot?.path);
    this.log = new ConversationLog(
      spec.logger,
      spec.messenger.capabilities.name,
    );
    this.replies = new ConversationReplies(
      spec.views,
      this.refs,
      new OptionLayout(spec.messenger.capabilities.options.max),
    );
    const composer = new ScreenComposer(
      spec.views,
      spec.messenger.capabilities,
    );
    this.output = new ConversationOutput(
      {
        messenger: spec.messenger,
        peer: spec.peer,
        replies: this.replies,
        log: this.log,
        ...(spec.texts === undefined ? {} : { texts: spec.texts }),
      },
      snapshot?.screen,
    );
    this.notices = new ConversationNotices(
      {
        messenger: spec.messenger,
        peer: spec.peer,
        views: spec.views,
        refs: this.refs,
        replies: this.replies,
        log: this.log,
        output: this.output,
      },
      snapshot?.notified,
    );
    this.screens = new ConversationScreens(
      {
        spec,
        composer,
        path: this.path,
        replies: this.replies,
        output: this.output,
        refs: this.refs,
        refreshed: (instance) => this.refreshed(instance),
        rebased: (serial, from, to) => this.input.rebase(serial, from, to),
      },
      snapshot?.serial ?? 0,
      snapshot?.screen,
    );
    this.input = new ConversationInput(
      {
        screens: this.screens,
        replies: this.replies,
        output: this.output,
        run: (draft, input, trace) => this.outcomes.run(draft, input, trace),
      },
      snapshot?.draft,
    );
    this.outcomes = new ConversationOutcomes({
      screens: this.screens,
      replies: this.replies,
      output: this.output,
      composer,
      input: this.input,
      handoff: new ExitHandoff({
        ...(spec.exits === undefined ? {} : { exits: spec.exits }),
        peer: spec.peer,
        person: spec.person,
        log: this.log,
      }),
    });
  }

  /** Сборка беседы с этими приложением, входом home и возможностями; не годится — бросок. */
  static assertFits(
    app: AnyUiAppDef,
    home: string,
    capabilities: MessengerCapabilities,
  ): void {
    const { max, ref } = capabilities.options;
    if (max < MIN_OPTIONS) {
      throw new Error(
        `Conversation: вариантов ${max}, нужно не меньше ${MIN_OPTIONS}`,
      );
    }
    if (ref < MAX_REF_LENGTH) {
      throw new Error(
        `Conversation: ссылка до ${ref} знаков, нужно ${MAX_REF_LENGTH}`,
      );
    }
    if (!Object.hasOwn(app.entries, home)) {
      throw new Error(
        `Conversation: у приложения ${app.name} нет входа ${home}`,
      );
    }
  }

  /** Собеседник годится: непустой, не длиннее `MAX_PEER_LENGTH` (сигнал и порт `peers`). */
  static fitsPeer(peer: string): boolean {
    return peer.length > 0 && peer.length <= MAX_PEER_LENGTH;
  }

  /** Предел сигнала нарушен — причина; сигнал в пределах — `undefined`. */
  static rejects(
    signal: ConversationSignal,
  ): 'peer' | 'signalId' | 'text' | undefined {
    if (!Conversation.fitsPeer(signal.peer)) return 'peer';
    if (signal.id.length > MAX_SIGNAL_ID) return 'signalId';
    if (signal.kind === 'text' && signal.text.length > MAX_SIGNAL_TEXT) {
      return 'text';
    }
    return undefined;
  }

  /**
   * Сигнал в очередь; повтор id — false и ничего. На нажатие — ровно один
   * ответ, последней операцией: с текстом реакции, если она его дала; при
   * дефекте — без текста. Дефект беседы — бросок наружу.
   */
  receive(signal: ConversationSignal): Promise<boolean> {
    if (!this.seen.accept(signal.id)) return Promise.resolve(false);
    return this.queue.run(async () => {
      this.output.begin(signal);
      let done = false;
      try {
        await this.handle(signal);
        done = true;
      } finally {
        const reply = this.output.end(done);
        if (signal.kind === 'press') await this.answer(signal.press, reply);
      }
      return true;
    });
  }

  snapshot(): ConversationSnapshot {
    const screen = this.screens.toJSON();
    const draft = this.input.toJSON();
    const notified = this.notices.toJSON();
    return {
      version: 1,
      person: this.spec.person,
      serial: this.screens.last(),
      refs: this.refs.toJSON(),
      seen: this.seen.toJSON(),
      ...(notified.length === 0 ? {} : { notified }),
      ...(screen === undefined ? {} : { screen }),
      ...(draft === undefined ? {} : { draft }),
      ...(this.path.empty() ? {} : { path: this.path.toJSON() }),
    };
  }

  /**
   * Уведомление собеседнику, в очереди беседы; `true` — сообщение дошло,
   * `false` — повтор по событию или порт отказал. Бросок представления — наружу.
   */
  notify(notification: DeliveredNotification): Promise<boolean> {
    return this.queue.run(
      async () => (await this.notices.deliver(notification)) === 'delivered',
    );
  }

  /** Снимок живого экземпляра ядра; нет экрана — `undefined`. */
  screen(): InstanceJson | undefined {
    return this.screens.instance();
  }

  /** Очередь беседы и очередь живого экземпляра отработали, новых задач не пришло (TST-04). */
  async settled(): Promise<void> {
    let mark: number;
    do {
      mark = this.queue.queued();
      await this.queue.idle();
      await this.screens.current()?.instance.settled();
    } while (mark !== this.queue.queued());
  }

  /** Подписка живого экрана снята, экземпляр закрыт; проактивных показов больше нет. */
  close(): void {
    this.closed = true;
    this.screens.close();
  }

  private async handle(signal: ConversationSignal): Promise<void> {
    const trace = this.spec.traces.next();
    // Экран снимка не восстановлен: вход исполняется, остальное поглощает home.
    if (!(await this.screens.wake(trace)) && signal.kind !== 'enter') {
      await this.screens.home(trace);
      return;
    }
    switch (signal.kind) {
      case 'enter':
        await this.enter(signal.entry, trace);
        return;
      case 'text':
        if (this.screens.current() === undefined)
          await this.screens.home(trace);
        else await this.input.text(signal.text, trace);
        return;
      case 'press':
        await this.press(signal.ref, trace);
        return;
      case 'attachment':
        await this.output.note(CONVERSATION_TEXTS.attachment);
        return;
      case 'cancel':
        await this.screens.show(
          this.input.cancel() ? CONVERSATION_TEXTS.cancelled : undefined,
        );
        return;
      case 'back':
        // «Назад» — уход с экрана: черновик сброшен без заметки.
        this.input.drop();
        await this.screens.back(trace);
        return;
      case 'help':
        await this.output.note(this.helpText());
        return;
      default: {
        const unknownKind: never = signal;
        throw new Error(
          `Conversation: неизвестный сигнал ${(unknownKind as ConversationSignal).kind}`,
        );
      }
    }
  }

  /**
   * Текст справки: по виду живого экрана, без него (до входа, после выхода)
   * — общая. Экземпляр, ссылки, путь и черновик не трогаются, UC не зовётся.
   */
  private helpText(): string {
    const live = this.screens.current();
    return live === undefined
      ? HelpText.general(this.help.general())
      : HelpText.of(this.help.of(live.instance.view()));
  }

  private async enter(name: string, trace: Trace): Promise<void> {
    const { entries } = this.spec.app;
    // Имя входа — внешние данные: `constructor` и прочие имена прототипа — не вход.
    const entry = Object.hasOwn(entries, name) ? entries[name] : undefined;
    if (entry === undefined) {
      await this.output.note(CONVERSATION_TEXTS.noEntry);
      return;
    }
    await this.screens.enter(entry.address, trace);
  }

  /** Нажатие по записи таблицы ссылок. */
  private async press(ref: string, trace: Trace): Promise<void> {
    const entry = this.refs.entry(ref);
    if (entry === undefined) {
      await this.output.unknownRef();
      return;
    }
    // Шаг черновика — его дело; отключённый вариант черновик не трогает,
    // любой другой — сбрасывает.
    if (ConversationInput.steps(entry)) {
      await this.input.step(entry, trace);
      return;
    }
    // Отключённый вариант ничего не меняет: ни черновик, ни экземпляр (D-UI-105).
    if (entry.kind === 'disabled') {
      const on = await this.screens.onScreen(entry.screen);
      if (on !== undefined) await this.outcomes.disabled(on, entry.name);
      return;
    }
    this.input.drop();
    switch (entry.kind) {
      case 'action': {
        const on = await this.screens.onScreen(entry.screen);
        if (on === undefined) return;
        const { action, revision } = entry;
        const fields = Conversation.fieldsOf(
          on.instance.view().actions,
          action,
        );
        if (fields.length > 0) {
          const target = { kind: 'action', action, revision } as const;
          await this.input.start(on.serial, target, fields, trace);
          return;
        }
        await this.outcomes.act(
          on,
          { ...entry, input: undefined, confirmed: false },
          trace,
        );
        return;
      }
      case 'local': {
        const on = await this.screens.onScreen(entry.screen);
        if (on === undefined) return;
        const view = on.instance.view();
        const { local, revision } = entry;
        const fields = Conversation.fieldsOf(view.locals, local);
        if (revision !== view.revision) {
          await this.screens.show(CONVERSATION_TEXTS.stale);
        } else if (fields.length > 0) {
          const target = { kind: 'local', local, revision } as const;
          await this.input.start(on.serial, target, fields, trace);
        } else {
          await this.outcomes.local(on.instance, local);
        }
        return;
      }
      case 'confirm': {
        const on = await this.screens.onScreen(entry.screen);
        if (on === undefined) return;
        if (!entry.yes) await this.screens.show();
        else
          await this.outcomes.act(
            on,
            { ...entry, input: entry.input, confirmed: true },
            trace,
          );
        return;
      }
      case 'page':
        await this.screens.turn(entry.owner, entry.page);
        return;
      case 'open':
        await this.screens.openJson(entry.address, trace);
        return;
      case 'back': {
        // «Назад» чужого экрана не снимает путь живого.
        const on = await this.screens.onScreen(entry.screen);
        if (on === undefined) return;
        await this.screens.back(trace);
        return;
      }
      case 'home':
        await this.screens.home(trace);
        return;
      default: {
        const unknownKind: never = entry;
        throw new Error(
          `Conversation: неизвестная запись ${(unknownKind as RefEntry).kind}`,
        );
      }
    }
  }

  /** Поля входа действия вида; действия нет — полей нет. */
  private static fieldsOf(
    items: readonly (ActionView | LocalView)[],
    name: string,
  ): readonly ActionField[] {
    return items.find((item) => item.name === name)?.fields ?? [];
  }

  /** Перечитанный экземпляр — показ в очередь беседы, затем узлу — записать снимок; дефект показа — в лог. */
  private refreshed(instance: ScreenInstance): void {
    if (this.closed) return;
    this.queue
      .run(() => this.screens.refreshed(instance))
      .then(() => this.spec.shown?.())
      .catch((error: unknown) => {
        this.log.defect({ operation: 'refresh' }, error);
      });
  }

  private async answer(press: string, text?: string): Promise<void> {
    const { messenger, peer } = this.spec;
    const delivery = await messenger.answer(peer, press, text);
    if (!delivery.ok) this.log.undelivered('answer', delivery.error.reason);
  }
}
