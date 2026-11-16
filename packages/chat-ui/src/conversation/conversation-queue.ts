/**
 * Очередь беседы: сигналы и проактивные показы идут строго по одному, в
 * порядке постановки; отказ задачи очередь не рвёт. Счёт поставленных
 * задач — чтобы ожидание видело, что за время ожидания пришли новые.
 */
export class ConversationQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private count = 0;

  run<T>(task: () => Promise<T>): Promise<T> {
    this.count += 1;
    const next = this.tail.then(task);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Задачи, поставленные до вызова, отработали. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }

  /** Сколько задач поставлено с начала. */
  queued(): number {
    return this.count;
  }
}
