import { Trace, type TraceJson } from 'dmg-core';

/**
 * След на каждую операцию вкладки (открытие, действие): запрос канала
 * приложения UI. Его `requestId` исполнитель кладёт в простую команду
 * (`UcCall`), полный след сервер собирает сам.
 */
export class PageTraces {
  constructor(
    private readonly requestIds: () => string,
    private readonly channel: string,
  ) {}

  next(): TraceJson {
    return Trace.fromRequest({
      requestId: this.requestIds(),
      channel: { name: this.channel },
    }).toJSON();
  }
}
