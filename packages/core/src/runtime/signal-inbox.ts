import type { RefreshSignal } from './ports.types';

/**
 * Приёмник сигналов подписки, поставленной до загрузки: пока получателя
 * нет, хранит последний сигнал, после `attach` передаёт его и все
 * следующие сразу.
 */
export class SignalInbox {
  private target: ((signal: RefreshSignal) => void) | undefined;
  private last: RefreshSignal | undefined;

  /** Слушатель для `RefreshPort.watch`; стрелка — чтобы передавать без привязки. */
  readonly listener = (signal: RefreshSignal): void => {
    if (this.target === undefined) this.last = signal;
    else this.target(signal);
  };

  attach(target: (signal: RefreshSignal) => void): void {
    this.target = target;
    const last = this.last;
    this.last = undefined;
    if (last !== undefined) target(last);
  }
}
