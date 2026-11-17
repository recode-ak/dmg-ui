import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Токен бота в текстовых файлах репо и защита `.env` в `.gitignore`.
 * Токен узнаётся по форме BotFather: 8–10 цифр, двоеточие, 35 знаков
 * `[A-Za-z0-9_-]`. Ограничения шаблона: токен другой длины, разорванный
 * переносом или склеенный из частей не ловится; случайная строка такой формы —
 * ложное срабатывание. Текст нарушения не содержит самого токена.
 */
export class BotTokenScanner {
  protected static readonly TOKEN =
    /(?<![\w-])\d{8,10}:[A-Za-z0-9_-]{35}(?![\w-])/g;

  protected static readonly ENV_LINES = ['.env', '/.env', '.env*'];

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      file.lines().forEach((text, index) => {
        for (const _ of text.matchAll(BotTokenScanner.TOKEN)) {
          found.push({
            file: file.path,
            line: index + 1,
            text: 'токен бота по форме BotFather (значение скрыто)',
          });
        }
      });
    }
    return found;
  }

  /** `.gitignore` обязан исключать `.env`; нет файла — тоже нарушение. */
  scanGitignore(file: SourceFile | undefined): Violation[] {
    const lines = (file?.lines() ?? []).map((line) => line.trim());
    if (lines.some((line) => BotTokenScanner.ENV_LINES.includes(line))) {
      return [];
    }
    return [
      {
        file: file?.path ?? '.gitignore',
        line: 1,
        text: '.gitignore не исключает .env: токен бота может попасть в git',
      },
    ];
  }
}
