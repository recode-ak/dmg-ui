import { REF_EPOCH_LENGTH } from './conversation.const';

/** Основание счисления знаков эпохи: `[0-9a-z]`. */
const RADIX = 36;

/**
 * Эпоха ссылок по умолчанию (D-UI-44): `REF_EPOCH_LENGTH` случайных знаков
 * `[a-z0-9]` из `crypto.getRandomValues`. Порт беседы `epochs` — `RefEpochs.random`;
 * тест подставляет свои эпохи.
 */
export class RefEpochs {
  private constructor(private readonly length: number) {}

  /** Новая эпоха. */
  static random(): string {
    return new RefEpochs(REF_EPOCH_LENGTH).draw();
  }

  private draw(): string {
    // 2³² mod 36 = 4: смещение остатка — порядка 10⁻⁹ на знак, им можно пренебречь.
    const words = crypto.getRandomValues(new Uint32Array(this.length));
    return Array.from(words, (word) => (word % RADIX).toString(RADIX)).join('');
  }
}
