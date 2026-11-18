import type { Trace } from 'dmg-core';
import type { ActionOutcome } from 'dmg-ui';
import type { ConversationExits } from './conversation.types';
import type { ConversationLog } from './conversation-log';

/** Исход ядра «выход сторис». */
type Exited = Extract<ActionOutcome, { readonly kind: 'exited' }>;

/** Части беседы, от имени которой выход отдаётся приёмнику. */
type HandoffParts = {
  /** Порт проекта; нет — выход никому не отдаётся. */
  readonly exits?: ConversationExits;
  readonly peer: string;
  /** uuid владельца беседы. */
  readonly person: string;
  readonly log: ConversationLog;
};

/**
 * Передача выхода сторис приёмнику вне набора UI (D-UI-90): решает, принят
 * ли выход, до любого показа беседы. Бросок порта — дефект проекта: в лог
 * только имя ошибки (данные выхода — данные собеседника, ERR-07), выход не
 * принят, чтобы человек не остался на закрытом экране.
 */
export class ExitHandoff {
  constructor(private readonly parts: HandoffParts) {}

  /** Выход экрана `screen` приёмнику; принят — true; порта нет, отказ или бросок — false. */
  async take(screen: string, outcome: Exited, trace: Trace): Promise<boolean> {
    const { exits, peer, person, log } = this.parts;
    if (exits === undefined) return false;
    const exit = {
      peer,
      person,
      screen,
      exit: outcome.exit,
      ...(outcome.data === undefined ? {} : { data: outcome.data }),
    };
    try {
      return (await exits.accept(exit, trace)) === true;
    } catch (error) {
      log.defect({ operation: 'exit' }, error);
      return false;
    }
  }
}
