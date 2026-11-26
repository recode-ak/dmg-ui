import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Поиск ссылок на локальные номера и слова трека разработки (Т-N, ФР-N, П-N, «бриф», «фаза N», «design §N») и, в документах, на `conductor/` и `u7-school`. */
export class TrackReferenceScanner {
  /** `Т`, `С` — кириллические Т и С: латинские в `TST-04`, `UTC-8` не считаются. */
  protected static readonly TRACK = new RegExp(
    [
      '[\\u0422\\u0421]-[0-9]+',
      'ФР-[0-9]+',
      '(?<![\\p{L}\\p{N}_-])П-[0-9]+',
      '[Бб]риф',
      '(?<![\\p{L}\\p{N}_])Ф[0-9]+(?![\\p{L}\\p{N}_])',
      'фаз(?:а|ы|е|у|ой)? [0-9]+',
      'критери(?:й|я|ю|ем) [0-9]+',
      'расхождени(?:е|я|ю) [0-9]+',
      'аудит(?:а)? (?:№|Ф)',
      'ревью Ф',
      '[Dd]esign §[0-9]+',
    ].join('|'),
    'gu',
  );

  protected static readonly OUTSIDE = /conductor\/|u7-school/g;

  /** Код и тесты: только шаблоны трека. */
  scanCode(files: SourceFile[]): Violation[] {
    return this.scan(files, [TrackReferenceScanner.TRACK]);
  }

  /** Документы: шаблоны трека и ссылки на внешние репо. */
  scanDocuments(files: SourceFile[]): Violation[] {
    return this.scan(files, [
      TrackReferenceScanner.TRACK,
      TrackReferenceScanner.OUTSIDE,
    ]);
  }

  protected scan(files: SourceFile[], patterns: RegExp[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      file.lines().forEach((text, index) => {
        for (const pattern of patterns) {
          for (const match of text.matchAll(pattern)) {
            found.push({ file: file.path, line: index + 1, text: match[0] });
          }
        }
      });
    }
    return found;
  }
}
