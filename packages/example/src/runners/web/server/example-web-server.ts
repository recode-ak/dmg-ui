import { type PageAdmission, PageGate, PageSockets } from 'dmg-ui/web-ui';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { EXAMPLE_COOKIE, EXAMPLE_PATHS } from '../common/example-web.const';
import { ClientBundle } from './client-bundle';
import { ExampleTokens } from './example-tokens';
import { ExampleWeb } from './example-web';
import {
  BIND_HOST,
  COOKIE_ATTRIBUTES,
  LOG_SOURCE,
  MAX_REQUEST_BODY,
  ORIGIN_HOSTS,
  SERVER_LOGS,
  SOCKET_OPTIONS,
  STYLES_FILE,
} from './example-web-server.const';
import type {
  ExampleAssets,
  ExampleWebServerHandle,
  ExampleWebServerSpec,
} from './example-web-server.types';
import { PageShell } from './page-shell';

/**
 * Привязка примера к сети: `Bun.serve` с сокетом страничного канала по шести
 * условиям гайда «Web-канал» (`web-channel-wire.md`, раздел 4.4). Страница на любой путь, кроме
 * служебных `/_…`; вход `POST /_enter/<ключ>` выдаёт пропуск человека; сокет
 * открывают только ворота `PageGate` (источник из списка, пропуск в cookie), и
 * `data` сокета — только их ответ. Файлы по пути запроса не читаются; в лог
 * идут фиксированные строки: ни пропусков, ни `Cookie`, ни `Origin`, ни
 * текста бросков.
 */
export class ExampleWebServer {
  /** Сборка клиента и стили: один раз на процесс, до первого `Bun.serve`. */
  private static assets: Promise<ExampleAssets> | undefined;

  private gate: PageGate | undefined;
  private server: Bun.Server<PageAdmission> | undefined;
  private stopping: Promise<void> | undefined;

  private constructor(
    private readonly spec: ExampleWebServerSpec,
    private readonly web: ExampleWeb,
    private readonly tokens: ExampleTokens,
    private readonly assetsOf: ExampleAssets,
  ) {}

  /** Запускает сервер; порт занят или сборка нарушает границы — бросок. */
  static async start(
    spec: ExampleWebServerSpec,
  ): Promise<ExampleWebServerHandle> {
    const tokens = await ExampleTokens.open(spec.dataDir, spec.uid);
    const assets = await ExampleWebServer.loadAssets(spec);
    const web = ExampleWeb.assemble({
      dataDir: spec.dataDir,
      tokens: (token) => tokens.personOf(token),
      logger: spec.logger,
      delayMs: spec.delayMs,
      ...(spec.wait === undefined ? {} : { wait: spec.wait }),
    });
    return new ExampleWebServer(spec, web, tokens, assets).listen();
  }

  private static loadAssets(
    spec: ExampleWebServerSpec,
  ): Promise<ExampleAssets> {
    ExampleWebServer.assets ??= ExampleWebServer.build().catch((error) => {
      ExampleWebServer.assets = undefined;
      spec.logger.error(LOG_SOURCE, SERVER_LOGS.assets);
      throw error;
    });
    return ExampleWebServer.assets;
  }

  private static async build(): Promise<ExampleAssets> {
    const bundle = await ClientBundle.build();
    const found = ClientBundle.violations(bundle);
    if (found.length > 0) {
      throw new Error(`Сборка клиента нарушает границы: ${found.join('; ')}`);
    }
    return { code: bundle.code, styles: await Bun.file(STYLES_FILE).text() };
  }

  private listen(): ExampleWebServerHandle {
    const { spec } = this;
    const sockets = new PageSockets({
      host: this.web.host,
      logger: spec.logger,
    });
    const server = Bun.serve<PageAdmission>({
      hostname: BIND_HOST,
      port: spec.port,
      // Тело запроса серверу не нужно: `POST /_enter` его не читает.
      maxRequestBodySize: MAX_REQUEST_BODY,
      fetch: (request, bound) => this.handle(request, bound),
      error: () => {
        spec.logger.error(LOG_SOURCE, SERVER_LOGS.failure);
        return new Response(null, { status: 500 });
      },
      websocket: {
        ...SOCKET_OPTIONS,
        // `close` обязателен: освобождает доставку, подписки и сессию.
        open: (socket) => sockets.open(socket),
        message: (socket, data) => sockets.message(socket, data),
        close: (socket) => sockets.close(socket),
      },
    });
    this.server = server;
    const port = server.port ?? spec.port;
    const origins = ORIGIN_HOSTS.map((host) => `http://${host}:${port}`);
    // Ворота создаются с известным портом; до первого запроса `await` нет.
    this.gate = new PageGate({ origins, cookie: EXAMPLE_COOKIE });
    return { port, origins, stop: () => this.stop() };
  }

  private stop(): Promise<void> {
    this.stopping ??= (async () => {
      // Сначала хост: задержанный вызов не исполняется, уведомитель отписан.
      await this.web.close();
      await this.server?.stop(true);
    })();
    return this.stopping;
  }

  private handle(
    request: Request,
    bound: Bun.Server<PageAdmission>,
  ): Response | undefined | Promise<Response | undefined> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(EXAMPLE_PATHS.enter)) {
      return this.enter(request, pathname);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return ExampleWebServer.status(405);
    }
    if (pathname === EXAMPLE_PATHS.socket) return this.upgrade(request, bound);
    if (pathname === EXAMPLE_PATHS.app) {
      return ExampleWebServer.asset(this.assetsOf.code, 'text/javascript');
    }
    if (pathname === EXAMPLE_PATHS.styles) {
      return ExampleWebServer.asset(this.assetsOf.styles, 'text/css');
    }
    if (pathname === '/favicon.ico') return ExampleWebServer.status(204);
    if (pathname.startsWith('/_')) return ExampleWebServer.status(404);
    return this.page(request);
  }

  /** Сокет: ворота решают по источнику и cookie; `data` — только их ответ. */
  private upgrade(
    request: Request,
    bound: Bun.Server<PageAdmission>,
  ): Response | undefined {
    const admitted = this.gate?.admit(request.headers);
    if (admitted === undefined || !admitted.ok) {
      this.spec.logger.warn(LOG_SOURCE, SERVER_LOGS.socketRefused);
      return ExampleWebServer.status(403);
    }
    return bound.upgrade(request, { data: admitted.value })
      ? undefined
      : ExampleWebServer.status(400);
  }

  /**
   * Вход `POST /_enter/<ключ>`: сначала источник (через ворота: годен и при
   * отказе `token` — cookie у входящего ещё нет), потом ключ человека.
   * Ответ — `303 /` и cookie с пропуском из каталога данных.
   */
  private enter(request: Request, pathname: string): Response {
    if (request.method !== 'POST') return ExampleWebServer.status(405);
    const verdict = this.gate?.admit(request.headers);
    if (verdict === undefined || (!verdict.ok && verdict.error === 'origin')) {
      this.spec.logger.warn(LOG_SOURCE, SERVER_LOGS.enterRefused);
      return ExampleWebServer.status(403);
    }
    const token = this.tokens.tokenOf(
      pathname.slice(EXAMPLE_PATHS.enter.length),
    );
    if (token === undefined) return ExampleWebServer.status(404);
    return new Response(null, {
      status: 303,
      headers: {
        Location: '/',
        'Set-Cookie': `${EXAMPLE_COOKIE}=${token}; ${COOKIE_ATTRIBUTES}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  /** Страница на любой путь: приложение с годным пропуском, иначе «Кто вы?»; клиент разбирает адрес сам. */
  private page(request: Request): Response {
    const key = this.tokens.keyOf(
      ExampleWebServer.cookie(request.headers.get('cookie')) ?? '',
    );
    const person = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
    const { html, headers } = PageShell.render({
      person,
      port: this.server?.port ?? this.spec.port,
    });
    return new Response(html, { status: 200, headers });
  }

  /**
   * Значение cookie пропуска: ровно одно вхождение имени, иначе `undefined`.
   * Правило повторяет `PageGate` (два вхождения — какое верное, неизвестно).
   */
  private static cookie(header: string | null): string | undefined {
    if (header === null) return undefined;
    const prefix = `${EXAMPLE_COOKIE}=`;
    const values = header
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => pair.startsWith(prefix))
      .map((pair) => pair.slice(prefix.length));
    return values.length === 1 ? values[0] : undefined;
  }

  private static asset(text: string, type: string): Response {
    return new Response(text, {
      headers: {
        'Content-Type': `${type}; charset=utf-8`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  }

  private static status(code: number): Response {
    return new Response(null, { status: code });
  }
}
