import { chmod, lstat, mkdir } from 'node:fs/promises';
import { DIR_MODE } from './example-data-dir.const';

/**
 * Каталог данных примера с пропусками: свой, не ссылка; чужой — отказ запуска
 * (стабильное имя мог создать чужой). Свой с открытыми правами закрывается до
 * `0700` только у каталога по умолчанию. Ссылка в середине пути допустима:
 * путь задаёт сам владелец, `realpath` не проверяется.
 */
export class ExampleDataDir {
  protected constructor(
    protected readonly dir: string,
    protected readonly uid: number | undefined,
    protected readonly tighten: boolean,
  ) {}

  /**
   * Готовит каталог `dir`: создаёт, проверяет владельца и вид. `uid` — владелец
   * процесса (нет — проверка владельца пропускается, например не на POSIX);
   * `tighten` — закрыть права до `0700` (каталог по умолчанию).
   */
  static prepare(
    dir: string,
    uid: number | undefined,
    tighten: boolean,
  ): Promise<void> {
    return new ExampleDataDir(dir, uid, tighten).run();
  }

  protected async run(): Promise<void> {
    const { dir, uid, tighten } = this;
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const stat = await lstat(dir);
    if (!stat.isDirectory()) {
      throw new Error('Каталог данных — не каталог (или ссылка)');
    }
    if (uid !== undefined && stat.uid !== uid) {
      throw new Error('Каталог данных принадлежит другому пользователю');
    }
    if (tighten && (stat.mode & 0o077) !== 0) await chmod(dir, DIR_MODE);
  }
}
