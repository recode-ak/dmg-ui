import { BOT_USERNAME } from './telegram-entries.const';

/**
 * Формат ссылки на экран в Telegram (D-UI-127): `https://t.me/<имя>?start=<код>`
 * — глубокая ссылка открывает бота и шлёт `/start <код>`. Имя бота — из
 * `getMe` проекта; проверка `BOT_USERNAME` при сборке: неверное имя — бросок,
 * а не битая ссылка. Результат — `ConversationsSpec.links.url`.
 *
 * @see telegram-links.test.ts
 */
export class TelegramLinks {
  private constructor() {}

  /** URL кода у бота `username`; имя не по `BOT_USERNAME` — бросок сборки. */
  static url(username: string): (code: string) => string {
    if (!BOT_USERNAME.test(username)) {
      throw new Error(
        `TelegramLinks: имя бота не по формату ${BOT_USERNAME.source}`,
      );
    }
    return (code) => `https://t.me/${username}?start=${code}`;
  }
}
