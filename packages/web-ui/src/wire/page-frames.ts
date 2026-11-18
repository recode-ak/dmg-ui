import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import { ServerMessage } from './page-messages';
import type {
  PageRefusal,
  ServerMessage as ServerMessageType,
} from './page-messages.types';
import { MAX_SERVER_TEXT } from './page-wire.const';

/**
 * Разбор строки сервера на клиентской стороне — общий для провода в памяти и
 * конца сокета. Длина проверяется до `JSON.parse`: длинная строка не
 * разбирается вовсе. Длиннее `MAX_SERVER_TEXT` — `too-large`; не JSON или не
 * по схеме — `malformed`. Функция, а не класс: разбор без состояния (biome
 * `noStaticOnlyClass`).
 */
export function serverFrame(
  text: string,
): Result<ServerMessageType, PageRefusal> {
  if (text.length > MAX_SERVER_TEXT) return err('too-large');
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err('malformed');
  }
  const parsed = v.safeParse(ServerMessage, json);
  return parsed.success ? ok(parsed.output) : err('malformed');
}
