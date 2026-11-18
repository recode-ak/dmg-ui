import { InProcEventBus } from 'dmg-core/app';
import { ExampleApp, type ExampleUser } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiNotifier, UiServer } from 'dmg-ui/server';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import { PageHost } from 'dmg-ui/web-ui';
import { ExamplePagesAppDef } from 'dmg-ui/web-ui/testing';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { DelayedDispatch } from './delayed-dispatch';
import { PLACES } from './example-web.const';
import type { ExampleWebSpec } from './example-web.types';

/**
 * Сборка примера без сети: учебное приложение над каталогом данных, сервер
 * UI с «медленным сервером», хост страничного канала и уведомитель. Не знает
 * ни сокета, ни окружения: привязку к сети делает `ExampleWebServer`.
 */
export class ExampleWeb {
  private closed = false;

  protected constructor(
    readonly host: PageHost<ExampleUser>,
    private readonly delayed: DelayedDispatch<ExampleUser>,
    private readonly stopNotifier: () => void,
  ) {}

  static assemble(spec: ExampleWebSpec): ExampleWeb {
    const { logger } = spec;
    const context = { bus: new InProcEventBus(logger), logger };
    const example = new ExampleApp(
      {
        mode: 'test',
        dataDir: spec.dataDir,
        users: EXAMPLE_PEOPLE.map((person) => person.uuid),
      },
      context,
    );
    const dispatch = new ApiAppDispatch(example.api);
    const delayed = new DelayedDispatch({
      inner: dispatch,
      delayMs: spec.delayMs,
      ...(spec.wait === undefined ? {} : { wait: spec.wait }),
    });
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: delayed,
      context,
    });
    const host = new PageHost({
      app: ExamplePagesAppDef,
      server,
      tokens: spec.tokens,
      callers: example.callers,
      places: PLACES,
      logger,
    });
    // Уведомитель берёт обычный вызов: задержка касается только действий человека.
    const notifier = new UiNotifier({
      app: ExamplePagesAppDef,
      codes: exampleCodes(),
      dispatch,
      callers: example.callers,
      delivery: host.delivery,
      // Журнал операций серверу примера не нужен: записи не копятся.
      observer: { record: () => {} },
      context,
    });
    return new ExampleWeb(host, delayed, notifier.start());
  }

  /** Отписывает уведомитель и освобождает задержанный вызов (он не исполняется); повторно — без действия. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.stopNotifier();
    this.delayed.close();
  }
}
