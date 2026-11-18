import { resolve } from 'node:path';
import { MAX_CLIENT_TEXT, MAX_SERVER_TEXT } from 'dmg-ui/web-ui';

/**
 * Опции сокета привязки: предел кадра клиента — до 3 байт UTF-8 на знак
 * предела строки пакета; очередь отправки — не меньше трёх строк сервера, при
 * переполнении сокет закрывается, а не теряет кадры. Пульс: сервер сам шлёт
 * ping и закрывает молчащего по сроку — полуоткрытое соединение не держит
 * место из восьми на личность. Браузер на ping отвечает сам, клиенту писать
 * ничего не нужно. Срок — из диапазона 60–120 с.
 */
export const SOCKET_OPTIONS = {
  maxPayloadLength: 3 * MAX_CLIENT_TEXT,
  backpressureLimit: 3 * MAX_SERVER_TEXT,
  closeOnBackpressureLimit: true,
  sendPings: true,
  idleTimeout: 60,
} as const;

/** Привязка только к петле: пример без пароля, чужим он не виден. */
export const BIND_HOST = '127.0.0.1';

/** Хосты, с которых браузер открывает пример: источники запросов (`Origin`). */
export const ORIGIN_HOSTS = ['localhost', '127.0.0.1'] as const;

/** Стили страницы: один файл клиента, читается при старте (путь не из запроса). */
export const STYLES_FILE = resolve(import.meta.dir, '../client/app.css');

/** Предел тела запроса, байт: формы входа приходят пустыми. */
export const MAX_REQUEST_BODY = 1024;

/** Источник записей лога сервера. */
export const LOG_SOURCE = 'ExampleWebServer';

/** Фиксированные строки лога: ни пропусков, ни заголовков запросов, ни текста бросков. */
export const SERVER_LOGS = {
  socketRefused: 'запрос соединения отклонён',
  enterRefused: 'вход отклонён',
  failure: 'сбой обработки запроса',
  assets: 'сборка клиента нарушает границы',
} as const;

/** Атрибуты cookie пропуска: без `Secure` (пример на `http`) и срока (сессионная). */
export const COOKIE_ATTRIBUTES = 'HttpOnly; SameSite=Strict; Path=/';
