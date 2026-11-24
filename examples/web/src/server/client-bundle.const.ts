import { resolve } from 'node:path';

/** Вход клиента примера: единственный файл, который сам запускает страницу. */
export const CLIENT_ENTRY = resolve(import.meta.dir, '../client/main.ts');

/**
 * Каталоги, которых нет в сборке для браузера. Сегменты, а не полные пути:
 * метафайл дописывает `../` до корня репо. Каталога `web-ui/src/url/` здесь
 * нет намеренно: клиент разбирает адрес.
 */
export const FORBIDDEN_SEGMENTS: readonly string[] = [
  'dmg-core/src/app/',
  'dmg-core/src/arch/',
  'dmg-core/src/graph/',
  'dmg-core/src/cli',
  'dmg-core/src/gen',
  'dmg-core/src/testing/example/backend/',
  'dmg-core/src/testing/example/runners/',
  'core/src/server/',
  'core/src/graph/',
  'web-ui/src/server/',
  'web-ui/src/graph/',
  'examples/web/src/server/',
];

/** Слова среды сервера, которых нет в выводе для браузера. */
export const FORBIDDEN_WORDS: readonly RegExp[] = [
  /(?<![\p{L}\p{N}_$])Bun\./u,
  /(?<![\p{L}\p{N}_$])process\./u,
  /(?<![\p{L}\p{N}_$.])require\(/u,
];
