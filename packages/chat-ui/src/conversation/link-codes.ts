import type { AddressJson } from 'dmg-ui';
import { LINK_CODE, LINK_CODE_LENGTH } from './conversation.const';
import { Sha256 } from './sha256';

/** Алфавит base64url (RFC 4648, §5) — знаки кода ссылки. */
const BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Код ссылки на экран беседы (D-UI-127): SHA-256 канонического JSON адреса
 * (адрес — после круга через JSON, ключи объектов по порядку на каждом
 * уровне, порядок элементов массива сохранён) → base64url → первые
 * `LINK_CODE_LENGTH` знаков (132 бита). Один
 * адрес — один код; без соли и срока: код без записи хранилища ничего не
 * открывает. Класс чистый — хранилища не знает.
 *
 * @see link-codes.test.ts
 */
export class LinkCodes {
  private constructor() {}

  /** Код адреса; не JSON-представимый адрес (`BigInt`, цикл) — бросок. */
  static async of(json: AddressJson): Promise<string> {
    const digest = await Sha256.bytes(LinkCodes.canonical(json));
    return LinkCodes.base64url(digest).slice(0, LINK_CODE_LENGTH);
  }

  /** Строка — код по формату `LINK_CODE`. */
  static fits(code: string): boolean {
    return LINK_CODE.test(code);
  }

  /**
   * Канонический JSON значения: сначала круг через JSON — ключи с
   * `undefined` и не-JSON значения уходят, как в хранилище и в снимке; затем
   * ключи объектов по порядку. Тот же текст у двух значений — один адрес
   * (выдача сверяет запись хранилища с адресом). Не JSON-представимое
   * (`BigInt`, цикл) — бросок.
   */
  static canonical(value: unknown): string {
    const json = JSON.stringify(value);
    return json === undefined ? 'null' : LinkCodes.sorted(JSON.parse(json));
  }

  /** Текст значения JSON с ключами объектов по порядку. */
  private static sorted(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => LinkCodes.sorted(item)).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
      const body = Object.keys(value)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${LinkCodes.sorted((value as Record<string, unknown>)[key])}`,
        );
      return `{${body.join(',')}}`;
    }
    return JSON.stringify(value);
  }

  /** base64url без дополнения `=`. */
  private static base64url(bytes: Uint8Array): string {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 6) {
        bits -= 6;
        out += BASE64URL.charAt((buffer >> bits) & 0x3f);
      }
      buffer &= (1 << bits) - 1;
    }
    if (bits > 0) out += BASE64URL.charAt((buffer << (6 - bits)) & 0x3f);
    return out;
  }
}
