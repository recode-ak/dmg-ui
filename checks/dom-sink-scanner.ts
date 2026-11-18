import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

const NAME = '[\\p{L}\\p{N}_$]';
/** Не часть имени: перед словом нет буквы, цифры, `_`, `$`; член чужого объекта (`el.innerHTML`) — часть проверки. */
const START = `(?<!${NAME})`;
const END = `(?!${NAME})`;

/**
 * Приёмники разметки и исполнения строки (`innerHTML`, `outerHTML`,
 * `insertAdjacentHTML`, `document.write`, `createContextualFragment`,
 * `DOMParser`, `srcdoc`, `eval(`, `new Function`, `javascript:`) в примере
 * `examples/web/src/` и клиенте `packages/web-ui/src/client/` без `.test.ts`:
 * строки людей попадают в DOM только текстом. Не ловит собранное из частей
 * и вычисляемый ключ; часть имени не нарушение, слово в комментарии — нарушение.
 */
export class DomSinkScanner {
  protected static readonly ZONES = [
    'examples/web/src/',
    'packages/web-ui/src/client/',
  ];

  protected static readonly SINKS = new RegExp(
    [
      `${START}(?:innerHTML|outerHTML|insertAdjacentHTML|createContextualFragment|DOMParser|srcdoc)${END}`,
      `${START}document\\.write${END}`,
      `${START}eval\\(`,
      `${START}new\\s+Function${END}`,
      `${START}javascript:`,
    ].join('|'),
    'gu',
  );

  scan(files: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const file of files) {
      if (!DomSinkScanner.inZone(file.path)) continue;
      file.lines().forEach((text, index) => {
        for (const match of text.matchAll(DomSinkScanner.SINKS)) {
          found.push({ file: file.path, line: index + 1, text: match[0] });
        }
      });
    }
    return found;
  }

  protected static inZone(path: string): boolean {
    return (
      !path.endsWith('.test.ts') &&
      DomSinkScanner.ZONES.some((zone) => path.startsWith(zone))
    );
  }
}
