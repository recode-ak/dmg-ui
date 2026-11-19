import type { ActionOutcome, AddressJson, LocalOutcome } from 'dmg-ui';
import type { PageFormValues, PageRegionName } from 'dmg-ui/web-ui';
import type { ClosableRegion, GesturePort } from './example-gestures.types';
import { completed } from './expected';
import { GESTURE_FAULT } from './view-texts.const';

export type { GesturePort } from './example-gestures.types';

/**
 * Жесты и действия человека поверх порта клиента: открыть задачу, выполнить
 * с итогом до ответа, отметить, форма, подтверждение, ссылки. Наружу не
 * бросает: сбой порта — `undefined` и фиксированная строка в `report`, без
 * данных и адресов.
 */
export class ExampleGestures {
  constructor(
    private readonly client: GesturePort,
    private readonly report: (text: string) => void,
  ) {}

  /** Открыть карточку задачи в `main` по значению варианта (`uuid`). */
  openTask(
    taskId: string,
    revision: number,
  ): Promise<ActionOutcome | undefined> {
    return this.run(() =>
      this.client.submitInput('main', 'open', { taskId }, revision),
    );
  }

  /** Выполнить задачу карточки; итог «выполнена» показан до ответа. */
  completeTask(
    region: PageRegionName,
    revision: number,
  ): Promise<ActionOutcome | undefined> {
    return this.run(() =>
      this.client.submitInput(
        region,
        'complete',
        undefined,
        revision,
        completed,
      ),
    );
  }

  /** Отметить или снять отметку со строки по `uuid`; область — `main` или окно `modal`. */
  toggleTask(
    taskId: string,
    region: PageRegionName = 'main',
  ): Promise<LocalOutcome | undefined> {
    return this.run(() => this.client.local(region, 'toggle', { taskId }));
  }

  /** Форма действия: все поля разом. */
  submitForm(
    region: PageRegionName,
    action: string,
    values: PageFormValues,
    revision?: number,
  ): Promise<ActionOutcome | undefined> {
    return this.run(() => this.client.submit(region, action, values, revision));
  }

  /** Действие без полей. */
  runAction(
    region: PageRegionName,
    action: string,
    revision: number,
  ): Promise<ActionOutcome | undefined> {
    return this.submitForm(region, action, {}, revision);
  }

  /** «Подтвердить» ожидающему подтверждению области. */
  confirm(region: PageRegionName): Promise<ActionOutcome | undefined> {
    return this.run(() => this.client.confirm(region));
  }

  /** Закрыть соседнюю или модальную область. */
  closeRegion(region: ClosableRegion): void {
    try {
      this.client.close(region);
    } catch {
      this.report(GESTURE_FAULT);
    }
  }

  /** «Повторить» отказавшей области. */
  async retry(region: PageRegionName): Promise<void> {
    await this.run(() => this.client.retry(region));
  }

  /** Ссылка записи входящих. */
  async openLink(address: AddressJson): Promise<void> {
    await this.run(() => this.client.openLink(address));
  }

  /** Переход по пути внутри страницы. */
  async follow(href: string): Promise<void> {
    await this.run(() => this.client.route(href));
  }

  /** Вызов порта: бросок и отклонение — `undefined` и строка в `report`. */
  private async run<T>(call: () => Promise<T>): Promise<T | undefined> {
    try {
      return await call();
    } catch {
      this.report(GESTURE_FAULT);
      return undefined;
    }
  }
}
