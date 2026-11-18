import { PAGE_URL_FIXED, PAGE_URL_NAME } from './page-urls.const';
import type { PagePathPart } from './page-urls.types';

/**
 * Шаблон пути маршрута: `/` или сегменты через `/` — неизменяемые
 * `[a-z0-9-]+` и параметры `:имя`. Синтаксис проверяется при сборке (бросок);
 * сопоставление идёт по уже декодированным сегментам, подстановка — по уже
 * закодированным текстам.
 * @see ./page-urls.test.ts
 */
export class PagePath {
  private constructor(
    /** Шаблон как объявлен: `/task/:taskId`. */
    readonly path: string,
    private readonly parts: readonly PagePathPart[],
  ) {}

  /** Шаблон из объявления маршрута; не по синтаксису или повтор параметра — бросок с путём. */
  static parse(path: string): PagePath {
    if (path === '/') return new PagePath(path, []);
    if (!path.startsWith('/')) {
      throw new Error(`PageUrls: шаблон пути «${path}» не начинается с /`);
    }
    const parts: PagePathPart[] = [];
    const names = new Set<string>();
    for (const segment of path.slice(1).split('/')) {
      const part = PagePath.part(path, segment);
      if (part.kind === 'param') {
        if (names.has(part.name)) {
          throw new Error(
            `PageUrls: параметр ${part.name} повторён в шаблоне пути «${path}»`,
          );
        }
        names.add(part.name);
      }
      parts.push(part);
    }
    return new PagePath(path, parts);
  }

  /** Имена параметров пути по порядку. */
  names(): readonly string[] {
    return this.parts.flatMap((part) =>
      part.kind === 'param' ? [part.name] : [],
    );
  }

  /**
   * Совпадают ли два шаблона на одном URL: одна длина, и в каждой позиции
   * оба сегмента неизменяемые и равны либо хотя бы один — параметр. Так
   * `/p/:a` и `/p/:b`, `/:s` и `/home`: у одного URL было бы два смысла.
   */
  overlaps(other: PagePath): boolean {
    if (this.parts.length !== other.parts.length) return false;
    return this.parts.every((part, index) => {
      const twin = other.parts[index];
      if (twin === undefined) return false;
      if (part.kind === 'param' || twin.kind === 'param') return true;
      return part.text === twin.text;
    });
  }

  /** Сегменты пути (декодированные) по шаблону: тексты параметров или `undefined`. */
  match(segments: readonly string[]): ReadonlyMap<string, string> | undefined {
    if (segments.length !== this.parts.length) return undefined;
    const texts = new Map<string, string>();
    for (const [index, part] of this.parts.entries()) {
      const segment = segments[index];
      if (segment === undefined) return undefined;
      switch (part.kind) {
        case 'fixed':
          if (segment !== part.text) return undefined;
          break;
        case 'param':
          texts.set(part.name, segment);
          break;
        default: {
          const never: never = part;
          throw new Error(`PageUrls: часть шаблона ${String(never)}`);
        }
      }
    }
    return texts;
  }

  /**
   * Путь по шаблону с параметрами из закодированных текстов. Нет текста,
   * пустой, `.` или `..` — `undefined`: такой сегмент путь не выражает.
   */
  fill(encoded: ReadonlyMap<string, string>): string | undefined {
    let path = '';
    for (const part of this.parts) {
      switch (part.kind) {
        case 'fixed':
          path += `/${part.text}`;
          break;
        case 'param': {
          const text = encoded.get(part.name);
          if (
            text === undefined ||
            text === '' ||
            text === '.' ||
            text === '..'
          )
            return undefined;
          path += `/${text}`;
          break;
        }
        default: {
          const never: never = part;
          throw new Error(`PageUrls: часть шаблона ${String(never)}`);
        }
      }
    }
    return path;
  }

  /** Сегмент шаблона: `:имя` — параметр, иначе неизменяемый; не по форме — бросок. */
  private static part(path: string, segment: string): PagePathPart {
    if (segment.startsWith(':')) {
      const name = segment.slice(1);
      if (PAGE_URL_NAME.test(name)) return { kind: 'param', name };
    } else if (PAGE_URL_FIXED.test(segment)) {
      return { kind: 'fixed', text: segment };
    }
    throw new Error(
      `PageUrls: сегмент «${segment}» шаблона пути «${path}» не по форме: [a-z0-9-]+ или :имя`,
    );
  }
}
