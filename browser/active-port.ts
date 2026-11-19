import type { ActivePortInfo } from './active-port.types';

/** Разбор файла `DevToolsActivePort`, который Chrome пишет в каталог профиля. */
export class ActivePort {
  protected constructor(protected readonly text: string) {}

  /**
   * Первая строка — порт, вторая — путь WebSocket от корня. Пока Chrome пишет
   * файл, чтение может поймать неполный текст: тогда `undefined`, и читатель
   * пробует снова.
   */
  static parse(text: string): ActivePortInfo | undefined {
    return new ActivePort(text).info();
  }

  protected info(): ActivePortInfo | undefined {
    const [first, second] = this.text.split('\n').map((line) => line.trim());
    if (first === undefined || second === undefined) return undefined;
    if (!/^\d+$/.test(first) || !second.startsWith('/')) return undefined;
    const port = Number(first);
    return port > 0 ? { port, path: second } : undefined;
  }
}
