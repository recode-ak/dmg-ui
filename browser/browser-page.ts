import type {
  AccessibleNode,
  AxNode,
  KeyDescription,
  PageKey,
} from './browser-page.types';
import type { CdpConnection } from './cdp-connection';

/** Сколько `waitFor`, `waitUntil` и `back` ждут события страницы, мс. */
const WAIT_MS = 5_000;

/** Клавиши протокола DevTools: Enter и пробел несут текст, поэтому вызывают `click` кнопки. */
const KEYS: Readonly<Record<PageKey, KeyDescription>> = {
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
};

type EvaluateResult<T> = {
  readonly result: { readonly value?: T };
  readonly exceptionDetails?: {
    readonly text: string;
    readonly exception?: { readonly description?: string };
  };
};

/**
 * Вкладка Chrome: переход, «Назад», выполнение кода в странице, ожидание
 * элемента или условия, клик по селектору и по тексту кнопки, клавиатура и
 * дерево доступности.
 */
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

  /**
   * Ждёт условие — выражение JS в странице: проверка сразу, при каждом
   * изменении DOM (`MutationObserver`) и после `popstate` (когда отработали
   * все его слушатели: адрес и запись не дают событий DOM). Не выполнилось
   * за `timeoutMs` — бросок с выражением; бросок выражения — дальше.
   */
  async waitUntil(js: string, timeoutMs = WAIT_MS): Promise<void> {
    const quoted = JSON.stringify(js);
    await this.evaluate(`new Promise((resolve, reject) => {
      const holds = () => Boolean(${js});
      let watcher;
      let timer;
      const finish = (end) => {
        watcher?.disconnect();
        removeEventListener('popstate', later);
        clearTimeout(timer);
        end();
      };
      const check = () => {
        try {
          if (holds()) finish(() => resolve(true));
        } catch (error) {
          finish(() => reject(error));
        }
      };
      const later = () => setTimeout(check, 0);
      try {
        if (holds()) return resolve(true);
      } catch (error) {
        return reject(error);
      }
      watcher = new MutationObserver(check);
      watcher.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      addEventListener('popstate', later);
      timer = setTimeout(() => {
        finish(() => reject(new Error('Условие не выполнилось за ${timeoutMs} мс: ' + ${quoted})));
      }, ${timeoutMs});
    })`);
  }

  /**
   * «Назад» браузера: одноразовый слушатель `popstate`, затем
   * `history.back()`; ждёт события. Не пришло за `timeoutMs` — бросок.
   * `back()` за первую запись уводит со страницы — бросок протокола.
   */
  async back(timeoutMs = WAIT_MS): Promise<void> {
    await this.evaluate(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        removeEventListener('popstate', arrived);
        reject(new Error('popstate не пришёл за ${timeoutMs} мс'));
      }, ${timeoutMs});
      const arrived = () => {
        clearTimeout(timer);
        resolve(true);
      };
      addEventListener('popstate', arrived, { once: true });
      history.back();
    })`);
  }

  /** Путь и строка запроса текущей страницы. */
  url(): Promise<string> {
    return this.evaluate<string>('location.pathname + location.search');
  }

  /**
   * Нажимает кнопку по видимому тексту внутри `scope` (селектор; все
   * совпавшие элементы). Нет такой кнопки или их несколько — бросок с текстом
   * и областью: нажатие не по той кнопке хуже отказа.
   */
  async clickText(text: string, scope = 'body'): Promise<void> {
    const quotedText = JSON.stringify(text);
    const quotedScope = JSON.stringify(scope);
    await this.evaluate(`(() => {
      const found = [...document.querySelectorAll(${quotedScope})]
        .flatMap((area) => [...area.querySelectorAll('button')])
        .filter((button) => button.getClientRects().length > 0 && button.innerText.trim() === ${quotedText});
      const unique = [...new Set(found)];
      if (unique.length !== 1) {
        throw new Error('Кнопок «' + ${quotedText} + '» в ' + ${quotedScope} + ': ' + unique.length);
      }
      unique[0].click();
    })()`);
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

  /** Нажимает клавишу в странице (`Input.dispatchKeyEvent`): нажатие и отпускание; возвращается, когда обработчики отработали. */
  async press(key: PageKey): Promise<void> {
    const { text, ...description } = KEYS[key];
    const base = { ...description, ...(text === undefined ? {} : { text }) };
    await this.connection.send(
      'Input.dispatchKeyEvent',
      { type: text === undefined ? 'rawKeyDown' : 'keyDown', ...base },
      this.sessionId,
    );
    await this.connection.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', ...description },
      this.sessionId,
    );
  }

  /**
   * Нажимает Tab, пока фокус не окажется на элементе по селектору, не более
   * `max` раз. Фокус уже там — без нажатий. Не дошёл — бросок с селектором и
   * числом нажатий.
   */
  async tabTo(selector: string, max = 40): Promise<void> {
    const matches = () =>
      this.evaluate<boolean>(
        `document.activeElement?.matches(${JSON.stringify(selector)}) === true`,
      );
    for (let pressed = 0; pressed < max; pressed += 1) {
      if (await matches()) return;
      await this.press('Tab');
    }
    if (await matches()) return;
    throw new Error(`Tab не дошёл до ${selector} за ${max} нажатий`);
  }

  /**
   * Узел дерева доступности элемента по селектору: роль, имя, описание,
   * отключён ли, доступен ли с клавиатуры. Нет элемента — бросок с
   * селектором. Вызывать последовательно: параллельные запросы ломают
   * идентификаторы узлов.
   */
  async accessibility(selector: string): Promise<AccessibleNode> {
    const { root } = await this.connection.send<{
      root: { nodeId: number };
    }>('DOM.getDocument', { depth: 0 }, this.sessionId);
    const { nodeId } = await this.connection.send<{ nodeId: number }>(
      'DOM.querySelector',
      { nodeId: root.nodeId, selector },
      this.sessionId,
    );
    if (nodeId === 0) throw new Error(`Нет элемента: ${selector}`);
    const { nodes } = await this.connection.send<{
      nodes: readonly AxNode[];
    }>(
      'Accessibility.getPartialAXTree',
      { nodeId, fetchRelatives: false },
      this.sessionId,
    );
    const node = nodes[0];
    if (node === undefined) {
      throw new Error(`Нет узла доступности: ${selector}`);
    }
    const flag = (name: string) =>
      node.properties?.some(
        (property) => property.name === name && property.value.value === true,
      ) ?? false;
    return {
      role: node.role?.value ?? '',
      name: node.name?.value ?? '',
      description: node.description?.value ?? '',
      disabled: flag('disabled'),
      focusable: flag('focusable'),
    };
  }
}
