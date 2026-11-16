/**
 * Очереди узла бесед по собеседнику: обработка сигналов одного собеседника
 * (личность, подъём из хранилища, исполнение, запись снимка, выгрузка) идёт
 * по одной, разные собеседники друг друга не ждут. Отказ задачи очередь не
 * рвёт; хвост отработавшей очереди забывается — карта не растёт.
 */
export class PeerQueues {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(peer: string, task: () => Promise<T>): Promise<T> {
    const next = (this.tails.get(peer) ?? Promise.resolve()).then(task);
    const tail = next.catch(() => undefined);
    this.tails.set(peer, tail);
    void tail.then(() => {
      if (this.tails.get(peer) === tail) this.tails.delete(peer);
    });
    return next;
  }

  /** Задачи всех собеседников, поставленные до вызова, отработали. */
  async idle(): Promise<void> {
    await Promise.all(this.tails.values());
  }
}
