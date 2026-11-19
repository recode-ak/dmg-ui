import type { PageSnapshot } from './page-client.types';

/** Запись истории вкладки: URL страницы (путь и строка запроса, без `#`) и запись — внешние данные, как есть. */
export type PageHistoryEntry = {
  readonly url: string;
  readonly record: unknown;
};

/**
 * Метки записи истории: `depth` — сколько своих записей позади, `over` —
 * запись положило открытие панели или окна (D-UI-97).
 */
export type PageHistoryMarks = {
  readonly depth: number;
  readonly over: boolean;
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
  /**
   * На запись назад, как «Назад» человека: переход приходит в `onTraverse`.
   * Браузер отвечает не сразу — промис может разрешиться до перехода.
   */
  back(): Promise<void> | void;
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
  /**
   * Ключ места — экран корневой области (в том числе грузящейся) без
   * параметров; пустой корень — `undefined`. Смена места — шаг, прочие
   * области — слои над ним.
   */
  readonly place: () => string | undefined;
  /** Какая-то область грузится. */
  readonly loading: () => boolean;
};

/** Страница глазами правила шага: ключ места и имена непустых областей. */
export type PageHistoryLayout = {
  readonly place: string | undefined;
  readonly regions: readonly string[];
};

/**
 * Что положило запись открытия слоя: открытые слои (`undefined` — вкладка
 * пришла на запись «Назадом» или перезагрузкой, слой неизвестен) и области
 * под ними — адрес и состояние на момент открытия или прихода.
 */
export type PageHistoryOpening = {
  readonly layers: readonly string[] | undefined;
  readonly under: Readonly<Record<string, string>>;
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
    back(): void;
  };
  readonly location: { readonly pathname: string; readonly search: string };
  addEventListener(type: 'popstate', listener: () => void): void;
};
