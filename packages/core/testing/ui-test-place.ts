import { NOT_TOPIC_HEAD, THROUGH_TEST_DIRS } from './ui-test-place.const';

/**
 * Форма теста рядом по `naming.md` §5 (`NM-01`, проверка `тест`): `<файл>.test.ts`,
 * `<файл>.<грань>.test.ts`, `<тема>-<что>.test.ts`, `readme.test.ts`, сквозной тест прямо
 * в `testing/`, `acceptance/`, `browser/`, `checks/`; `<имя>.story.test.ts` — только при
 * `<имя>.story.ts`. Соседей знает по списку файлов каталога, диск не читает.
 */
export class UiTestPlace {
  constructor(
    private readonly near: ReadonlyMap<string, ReadonlySet<string>>,
  ) {}

  /** Что не так с тестом `<dir>/<base>`; `undefined` — тест на месте или вне проверки. */
  problem(dir: string, base: string): string | undefined {
    if (base.endsWith('.browser.test.ts')) return undefined;
    const stem = base.slice(0, -'.test.ts'.length);
    const near = this.near.get(dir) ?? new Set<string>();
    const lost = `тест: «${base}» без файла рядом`;
    if (stem.endsWith('.story')) {
      return near.has(`${stem}.ts`)
        ? undefined
        : `${lost}: нужен ${stem}.ts — <имя>.story.test.ts тестирует только сторис <имя>.story.ts (naming.md §5)`;
    }
    const placed =
      stem === 'readme' ||
      near.has(`${stem}.ts`) ||
      this.hasFacetHead(stem, near) ||
      this.hasTopicHead(stem, near) ||
      THROUGH_TEST_DIRS.includes(dir.slice(dir.lastIndexOf('/') + 1));
    return placed ? undefined : `${lost}: ${this.hint(stem)} (naming.md §5)`;
  }

  /** Что положить рядом: для грани — её голову, для имени без точки — файл или голову темы. */
  private hint(stem: string): string {
    const dot = stem.lastIndexOf('.');
    if (dot < 0) {
      return `нужен ${stem}.ts или, для темы <тема>-<что>.test.ts, <тема>.ts или <тема>.<вид>.ts`;
    }
    const head = `${stem.slice(0, dot)}.ts`;
    const facet = stem.slice(dot + 1);
    return stem.indexOf('.') < dot
      ? `нужен ${head} — голова грани «${facet}»`
      : `нужен ${stem}.ts или ${head} для грани «${facet}»`;
  }

  /** `<файл>.<грань>.test.ts`: рядом есть `<файл>.ts` — стем без последнего сегмента. */
  private hasFacetHead(stem: string, near: ReadonlySet<string>): boolean {
    const dot = stem.lastIndexOf('.');
    return dot > 0 && near.has(`${stem.slice(0, dot)}.ts`);
  }

  /**
   * `<тема>-<что>.test.ts`: `<тема>` — собственный дефисный префикс имени теста, рядом есть
   * `<тема>.ts` или `<тема>.<вид>.ts` не из `NOT_TOPIC_HEAD`; префикс соседей тему не задаёт.
   */
  private hasTopicHead(stem: string, near: ReadonlySet<string>): boolean {
    if (stem.includes('.')) return false;
    const words = stem.split('-');
    for (let count = 1; count < words.length; count++) {
      const topic = words.slice(0, count).join('-');
      for (const name of near) {
        if (name === `${topic}.ts`) return true;
        if (name.startsWith(`${topic}.`) && !NOT_TOPIC_HEAD.test(name)) {
          return true;
        }
      }
    }
    return false;
  }
}
