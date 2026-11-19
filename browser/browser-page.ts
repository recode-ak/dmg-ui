import type { CdpConnection } from './cdp-connection';

/** Сколько `waitFor` ждёт появления элемента, мс. */
const WAIT_MS = 5_000;

type EvaluateResult<T> = {
  readonly result: { readonly value?: T };
  readonly exceptionDetails?: {
    readonly text: string;
    readonly exception?: { readonly description?: string };
  };
};

/** Вкладка Chrome: переход, выполнение кода в странице, ожидание и клик по селектору. */
export class BrowserPage {
  private constructor(
    private readonly connection: CdpConnection,
    private readonly sessionId: string,
  ) {}

  /** Создаёт пустую вкладку, подключается к ней и включает события страницы. */
  static async open(connection: CdpConnection): Promise<BrowserPage> {
    const { targetId } = await connection.send<{ targetId: string }>(
      'Target.createTarget',
      { url: 'about:blank' },
    );
    const { sessionId } = await connection.send<{ sessionId: string }>(
      'Target.attachToTarget',
      { targetId, flatten: true },
    );
    await connection.send('Page.enable', undefined, sessionId);
    return new BrowserPage(connection, sessionId);
  }

  /** Открывает адрес и ждёт события загрузки страницы. */
  async goto(url: string): Promise<void> {
    await this.untilLoaded(async () => {
      const { errorText } = await this.connection.send<{ errorText?: string }>(
        'Page.navigate',
        { url },
        this.sessionId,
      );
      if (errorText !== undefined) {
        throw new Error(`Переход на ${url} не удался: ${errorText}`);
      }
    });
  }

  /** Выполняет выражение в странице (обещание ждёт) и возвращает значение; исключение страницы — бросок. */
  async evaluate<T = unknown>(js: string): Promise<T> {
    const response = await this.connection.send<EvaluateResult<T>>(
      'Runtime.evaluate',
      { expression: js, returnByValue: true, awaitPromise: true },
      this.sessionId,
    );
    if (response.exceptionDetails !== undefined) {
      const { text, exception } = response.exceptionDetails;
      throw new Error(exception?.description ?? text);
    }
    return response.result.value as T;
  }

  /**
   * Ждёт элемент по селектору: проверка сразу и при каждом изменении DOM
   * (`MutationObserver`) — внутри страницы, без опроса. Не появился за
   * `timeoutMs` (по умолчанию 5 с) — бросок с селектором.
   */
  async waitFor(selector: string, timeoutMs = WAIT_MS): Promise<void> {
    const quoted = JSON.stringify(selector);
    await this.evaluate(`new Promise((resolve, reject) => {
      const found = () => document.querySelector(${quoted}) !== null;
      if (found()) return resolve(true);
      const watcher = new MutationObserver(() => {
        if (!found()) return;
        watcher.disconnect();
        resolve(true);
      });
      watcher.observe(document, { subtree: true, childList: true, attributes: true });
      setTimeout(() => {
        watcher.disconnect();
        reject(new Error('Элемент не появился за ${timeoutMs} мс: ' + ${quoted}));
      }, ${timeoutMs});
    })`);
  }

  /** Дожидается элемента и нажимает на него. */
  async click(selector: string): Promise<void> {
    await this.waitFor(selector);
    await this.evaluate(
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  }

  /** Нажимает на элемент, после которого браузер загружает новую страницу (ссылка, отправка формы), и ждёт её загрузки. */
  async clickToLoad(selector: string): Promise<void> {
    await this.waitFor(selector);
    await this.untilLoaded(() => this.click(selector));
  }

  /**
   * Выполняет действие и ждёт загрузки страницы. Событие ждётся с момента до
   * действия, чтобы не пропустить быструю загрузку; если действие бросило,
   * висящее ожидание гасится (иначе его отказ при закрытии сокета никто не
   * обработает), а ошибка действия идёт дальше.
   */
  private async untilLoaded(action: () => Promise<void>): Promise<void> {
    const loaded = this.connection.once('Page.loadEventFired', this.sessionId);
    try {
      await action();
    } catch (error) {
      loaded.catch(() => undefined);
      throw error;
    }
    await loaded;
  }

  /** Видимый текст элемента; нет элемента — бросок с селектором. */
  async text(selector: string): Promise<string> {
    const quoted = JSON.stringify(selector);
    return this.evaluate<string>(`(() => {
      const element = document.querySelector(${quoted});
      if (element === null) throw new Error('Нет элемента: ' + ${quoted});
      return element.innerText;
    })()`);
  }
}
