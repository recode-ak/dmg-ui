/** Каталоги сквозных тестов: тест прямо в них не требует своего файла рядом (`naming.md` §5). */
export const THROUGH_TEST_DIRS: readonly string[] = [
  'testing',
  'acceptance',
  'browser',
  'checks',
];

/**
 * Файлы, которые головой темы `<тема>-<что>.test.ts` не служат: типы, константы, тесты,
 * помощники тестов и файлы-сводки (`<m>.ui-module.ts` дал бы голову любому
 * `<m>-…test.ts` в папке модуля, `.set.ts` — в корне набора).
 */
export const NOT_TOPIC_HEAD =
  /\.(types|const|fixture|test-kit|ui-module|set)\.ts$|\.test\.ts$/;
