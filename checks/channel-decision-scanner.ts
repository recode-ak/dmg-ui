import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

const NAME = '[\\p{L}\\p{N}_$]';
/** Не часть имени: перед словом нет буквы, цифры, `_`, `$`; член чужого объекта (`subject.hasRole`) — часть проверки. */
const START = `(?<!${NAME})`;
const END = `(?!${NAME})`;

/**
 * Слова решения о доступности (`Policy`, `DomainRuleDef`, `ReadonlyAr`,
 * `hasRole`, `denyMessage`, вызов `.evaluate(`) в исходниках каналов
 * `packages/{chat-ui,tg-bot,web-ui}/src` без `.test.ts`: каналы не решают,
 * доступно ли действие, — ответ приходит в виде готовым из кода экрана
 * (D-UI-98). Слова целиком, часть имени не нарушение; слово в
 * комментарии — нарушение. Не ловит собранное из частей и вычисляемый ключ.
 */
export class ChannelDecisionScanner {
  protected static readonly ZONES = [
    'packages/chat-ui/src/',
    'packages/tg-bot/src/',
    'packages/web-ui/src/',
  ];

  protected static readonly WORDS = new RegExp(
    [
      `${START}(?:Policy|DomainRuleDef|ReadonlyAr|hasRole|denyMessage)${END}`,
      '\\.evaluate\\(',
    ].join('|'),
    'gu',
  );

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      if (!ChannelDecisionScanner.inZone(file.path)) continue;
      file.lines().forEach((text, index) => {
        for (const match of text.matchAll(ChannelDecisionScanner.WORDS)) {
          found.push({ file: file.path, line: index + 1, text: match[0] });
        }
      });
    }
    return found;
  }

  protected static inZone(path: string): boolean {
    return (
      !path.endsWith('.test.ts') &&
      ChannelDecisionScanner.ZONES.some((zone) => path.startsWith(zone))
    );
  }
}
