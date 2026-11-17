import type { ViewSource } from '../view/view-source.types';

/** Подписка ячейки: своя запись на каждый `subscribe`, даже одним слушателем. */
type Subscription<T> = { readonly listener: (value: T) => void };

/**
 * Ячейка вида — источник с записью: `set` нового объекта оповещает
 * слушателей, того же — нет. Бросок слушателя уходит в `onFault`, остальные
 * значение получают — как у `onChange` ядра (D-UI-70).
 */
export class ViewCell<T> implements ViewSource<T> {
  private value: T;
  /** Номер рассылки: новый `set` делает прежнюю рассылку устаревшей. */
  private version = 0;
  private readonly subscriptions = new Set<Subscription<T>>();

  constructor(
    initial: T,
    private readonly onFault?: (error: unknown) => void,
  ) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  subscribe(listener: (value: T) => void): () => void {
    const subscription: Subscription<T> = { listener };
    this.subscriptions.add(subscription);
    this.deliver(subscription, this.value);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  set(value: T): void {
    if (value === this.value) return;
    this.value = value;
    this.version += 1;
    const version = this.version;
    // Снятые во время оповещения подписки значение уже не получают; новый
    // `set` из слушателя прерывает эту рассылку, даже если вернул тот же
    // объект, — дальше идёт его рассылка.
    for (const subscription of [...this.subscriptions]) {
      if (this.version !== version) return;
      if (this.subscriptions.has(subscription)) {
        this.deliver(subscription, value);
      }
    }
  }

  private deliver(subscription: Subscription<T>, value: T): void {
    try {
      subscription.listener(value);
    } catch (error) {
      this.onFault?.(error);
    }
  }
}
