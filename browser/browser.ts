import { BrowserPage } from './browser-page';
import { CdpConnection } from './cdp-connection';
import { ChromeLocator } from './chrome-locator';
import { ChromeProcess } from './chrome-process';

/** Браузер для тестов: Chrome без окна и соединение DevTools с ним. */
export class Browser {
  private closing: Promise<void> | undefined;

  private constructor(
    private readonly chrome: ChromeProcess,
    private readonly connection: CdpConnection,
  ) {}

  /**
   * Находит Chrome по окружению (`CHROME_BIN`, затем имена в `PATH`), запускает
   * его и подключается. Chrome нет — `ChromeNotFoundError`.
   */
  static async launch(
    env: Record<string, string | undefined> = process.env,
  ): Promise<Browser> {
    const chrome = await ChromeProcess.launch(ChromeLocator.find(env));
    try {
      return new Browser(chrome, await CdpConnection.open(chrome.endpoint));
    } catch (error) {
      await chrome.close();
      throw error;
    }
  }

  /** Номер процесса Chrome. */
  get pid(): number {
    return this.chrome.pid;
  }

  /** Каталог профиля Chrome: после `close()` его нет. */
  get profileDir(): string {
    return this.chrome.profileDir;
  }

  /** Новая вкладка. */
  newPage(): Promise<BrowserPage> {
    return BrowserPage.open(this.connection);
  }

  /** Закрывает соединение и Chrome (вкладки уходят с ним), удаляет профиль; повторный вызов — без действия. */
  close(): Promise<void> {
    this.closing ??= this.shutdown();
    return this.closing;
  }

  private async shutdown(): Promise<void> {
    try {
      await this.connection.close();
    } finally {
      await this.chrome.close();
    }
  }
}
