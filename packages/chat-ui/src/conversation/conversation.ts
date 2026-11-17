import type { Trace } from 'dmg-core';
import type {
  ActionField,
  ActionView,
  AddressJson,
  AnyUiAppDef,
  InstanceJson,
  LocalView,
  ScreenInstance,
} from 'dmg-ui';
import { DIALOG_TEXTS } from '../dialog/dialog-replies';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import {
  CONVERSATION_TEXTS,
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
import { ConversationOutcomes } from './conversation-outcomes';
import { ConversationQueue } from './conversation-queue';
import { ConversationReplies } from './conversation-replies';
import { ConversationScreens } from './conversation-screens';
import { OptionLayout } from './option-layout';
import { RefTable } from './ref-table';
import { SeenSignals } from './seen-signals';

/**
 * Беседа одного собеседника (D-UI-43): сигналы мессенджера и проактивные
 * показы идут по одному через очередь, повтор id отсеивается, нажатие
 * разбирается по записи таблицы ссылок, вход действия с полями собирает
 * черновик, исходы ядра — по таблице политик (гайд `channel-package.md`).
 *
 * @see conversation.test.ts
 */
export class Conversation {
  private readonly spec: ConversationSpec;
  private readonly queue = new ConversationQueue();
  private readonly refs: RefTable;
  private readonly seen: SeenSignals;
  private readonly replies: ConversationReplies;
  private readonly log: ConversationLog;
  private readonly screens: ConversationScreens;
  private readonly input: ConversationInput;
  private readonly outcomes: ConversationOutcomes;
  private closed = false;

  /** Возможности не годятся (`options.max < 3`, `options.ref < 16`) или нет входа home — бросок. */
  constructor(spec: ConversationSpec, snapshot?: ConversationSnapshot) {
    Conversation.assertFits(spec.app, spec.home, spec.messenger.capabilities);
    this.spec = spec;
    this.refs = new RefTable(spec.epochs(), snapshot?.refs);
    this.seen = new SeenSignals(snapshot?.seen);
    this.log = new ConversationLog(
      spec.logger,
      spec.messenger.capabilities.name,
    );
    this.replies = new ConversationReplies(
      spec.replies,
      this.refs,
      new OptionLayout(spec.messenger.capabilities.options.max),
    );
    this.screens = new ConversationScreens(
      {
        spec,
        replies: this.replies,
        refs: this.refs,
        log: this.log,
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
        run: (draft, input, trace) => this.outcomes.run(draft, input, trace),
      },
      snapshot?.draft,
    );
    this.outcomes = new ConversationOutcomes({
      screens: this.screens,
      replies: this.replies,
      input: this.input,
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

  /** Предел сигнала нарушен — причина; сигнал в пределах — `undefined`. */
  static rejects(signal: ConversationSignal): 'signalId' | 'text' | undefined {
    if (signal.id.length > MAX_SIGNAL_ID) return 'signalId';
    if (signal.kind === 'text' && signal.text.length > MAX_SIGNAL_TEXT) {
      return 'text';
    }
    return undefined;
  }

  /** Сигнал в очередь; повтор id — false и ничего. Дефект беседы — бросок наружу. */
  receive(signal: ConversationSignal): Promise<boolean> {
    if (!this.seen.accept(signal.id)) return Promise.resolve(false);
    return this.queue.run(async () => {
      try {
        await this.handle(signal);
      } finally {
        if (signal.kind === 'press') await this.answer(signal.press);
      }
      return true;
    });
  }

  snapshot(): ConversationSnapshot {
    const screen = this.screens.toJSON();
    const draft = this.input.toJSON();
    return {
      version: 1,
      person: this.spec.person,
      serial: this.screens.last(),
      refs: this.refs.toJSON(),
      seen: this.seen.toJSON(),
      ...(screen === undefined ? {} : { screen }),
      ...(draft === undefined ? {} : { draft }),
    };
  }

  /** Снимок живого экземпляра ядра; нет экрана — `undefined`. */
  screen(): InstanceJson | undefined {
    return this.screens.instance();
  }

  /** Открыть экран из снимка экземпляра (внешние данные): отказ — заметка и вход home. В очереди. */
  resume(instance: unknown): Promise<void> {
    return this.queue.run(() =>
      this.screens.resume(instance, this.spec.traces.next()),
    );
  }

  /** Ссылка «открыть адрес» в таблице беседы (ссылки уведомления). В очереди. */
  link(address: AddressJson, label: string): Promise<string> {
    return this.queue.run(async () =>
      this.refs.add({ kind: 'open', address, label }),
    );
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
        await this.screens.note(CONVERSATION_TEXTS.attachment);
        return;
      case 'cancel':
        await this.screens.show(
          this.input.cancel() ? CONVERSATION_TEXTS.cancelled : undefined,
        );
        return;
      default: {
        const unknownKind: never = signal;
        throw new Error(
          `Conversation: неизвестный сигнал ${(unknownKind as ConversationSignal).kind}`,
        );
      }
    }
  }

  private async enter(name: string, trace: Trace): Promise<void> {
    const { entries } = this.spec.app;
    // Имя входа — внешние данные: `constructor` и прочие имена прототипа — не вход.
    const entry = Object.hasOwn(entries, name) ? entries[name] : undefined;
    if (entry === undefined) {
      await this.screens.note(CONVERSATION_TEXTS.noEntry);
      return;
    }
    await this.screens.open(entry.address, trace);
  }

  /** Нажатие по записи таблицы ссылок. */
  private async press(ref: string, trace: Trace): Promise<void> {
    const entry = this.refs.entry(ref);
    if (entry === undefined) {
      await this.screens.note(DIALOG_TEXTS.unknownRef);
      return;
    }
    // Шаг черновика — его дело; любой другой вариант черновик сбрасывает.
    if (ConversationInput.steps(entry)) {
      await this.input.step(entry, trace);
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
          await this.screens.show(DIALOG_TEXTS.stale);
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

  private async answer(press: string): Promise<void> {
    const delivery = await this.spec.messenger.answer(this.spec.peer, press);
    if (!delivery.ok) this.log.undelivered('answer', delivery.error.reason);
  }
}
