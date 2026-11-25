import { MemoryLogger } from 'dmg-core/testing';
import { ExampleWebServer } from '../packages/example/src/runners/web/server/example-web-server';
import type { ExampleWebServerHandle } from '../packages/example/src/runners/web/server/example-web-server.types';
import type { BrowserPage } from './browser-page';

/** Сервер раннера `web` учебного проекта на свободном порту: цель браузерных тестов. */
export class ExampleWebFixture {
  private constructor(private readonly server: ExampleWebServerHandle) {}

  /** Запускает сервер без искусственной задержки; `dataDir` — каталог данных (в тестах временный). */
  static async start(dataDir: string): Promise<ExampleWebFixture> {
    const server = await ExampleWebServer.start({
      port: 0,
      dataDir,
      delayMs: 0,
      logger: new MemoryLogger(),
    });
    return new ExampleWebFixture(server);
  }

  /** Источник сервера — из списка разрешённых ему источников запросов. */
  get origin(): string {
    return `http://127.0.0.1:${this.server.port}`;
  }

  /** Вход как человек: страница «Кто вы?», кнопка с его ключом, загрузка приложения. */
  async enterAs(page: BrowserPage, key: string): Promise<void> {
    await page.goto(this.origin);
    await page.clickToLoad(`form[action="/_enter/${key}"] button`);
  }

  /** Останавливает сервер; повторно — без действия. */
  stop(): Promise<void> {
    return this.server.stop();
  }
}
