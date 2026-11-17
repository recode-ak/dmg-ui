import type { UndeliveredReason } from 'dmg-ui/chat-ui';
import { NOT_MODIFIED } from './bot-api.const';
import type { BotApiRefusal } from './bot-api.types';

/**
 * Разбор отказа Bot API (D-UI-61): 403 — собеседник запретил, 429 и 5xx —
 * временно (повтора по `retry_after` нет), прочее — дефект показа.
 * «message is not modified» — отдельный признак правки «то же»: подстрока
 * без учёта регистра и только у 400 (дословно в Bot API не подтверждена:
 * не распознана — откат новым сообщением, видимый дубль, а не потеря).
 */
export class BotApiFailure {
  constructor(private readonly refusal: BotApiRefusal) {}

  reason(): UndeliveredReason {
    const code = this.refusal.error_code;
    if (code === 403) return 'blocked';
    if (code === 429 || code >= 500) return 'unavailable';
    return 'rejected';
  }

  notModified(): boolean {
    return (
      this.refusal.error_code === 400 &&
      this.refusal.description.toLowerCase().includes(NOT_MODIFIED)
    );
  }

  /** Код отказа — для лога. */
  code(): number {
    return this.refusal.error_code;
  }

  /** Описание сервера для лога: не длиннее предела, без данных собеседника. */
  description(max: number): string {
    return this.refusal.description.slice(0, max).toWellFormed();
  }
}
