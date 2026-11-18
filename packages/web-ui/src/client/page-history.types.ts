import type { PageSnapshot } from './page-client.types';

/** Запись истории вкладки: URL страницы (путь и строка запроса, без `#`) и запись — внешние данные, как есть. */
export type PageHistoryEntry = {
  readonly url: string;
  readonly record: unknown;
};

/**
 * Порт истории вкладки: строки и `unknown`, без типов браузера. `push` и
 * `replace` вправе бросать (браузер отказывает по частоте, размеру, чужому
 * источнику) — клиент ловит сам (D-UI-81).
 */
export type PageHistoryPort = {
  /** Текущая запись: первая загрузка, перезагрузка. */
  current(): PageHistoryEntry;
  /** Новый шаг. */
  push(url: string, record: string): void;
  /** Текущая запись заново. */
  replace(url: string, record: string): void;
  /** «Назад», «Вперёд», переход на запись: обработчик получает запись, на которой вкладка теперь. */
  onTraverse(handler: (entry: PageHistoryEntry) => Promise<void> | void): void;
};

/**
 * Страница глазами истории: ссылка, снимок, адреса областей и загрузка.
 * Имён областей история не знает — только ключи этих значений.
 */
export type PageHistoryPage = {
  readonly url: () => string | undefined;
  readonly snapshot: () => PageSnapshot;
  /** Адрес каждой непустой области JSON-строкой, в том числе грузящейся. */
  readonly places: () => Readonly<Record<string, string>>;
  /** Какая-то область грузится. */
  readonly loading: () => boolean;
};

/**
 * Узкий тип окна браузера для привязки истории: только то, что она читает и
 * зовёт. Типов DOM пакет не подключает — окно привязки ему присваивается.
 */
export type PageBrowserWindow = {
  readonly history: {
    readonly state: unknown;
    pushState(data: unknown, unused: string, url: string): void;
    replaceState(data: unknown, unused: string, url: string): void;
  };
  readonly location: { readonly pathname: string; readonly search: string };
  addEventListener(type: 'popstate', listener: () => void): void;
};
