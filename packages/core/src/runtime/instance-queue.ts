/**
 * Очередь экземпляра: задачи (`act`, `local`, перечитывание) идут строго
 * по одной, в порядке постановки. Отказ задачи очередь не рвёт.
 */
export class InstanceQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Задачи, поставленные до вызова, отработали; отказ задачи ожидание не рвёт. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }
}
