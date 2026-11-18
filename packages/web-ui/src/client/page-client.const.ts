import type { PageRegionName } from './page-client.types';

/** Области страницы по порядку: единственный перечень, типы и циклы выводятся из него. */
export const PAGE_REGIONS = ['main', 'side', 'modal'] as const;

/** Корневая область: выход из экрана ведёт в её вход `start`, закрыть её нельзя. */
export const PAGE_ROOT_REGION = 'main' as const;

/** Временные области: уход из них переходом закрывает их. */
export const PAGE_TRANSIENT_REGIONS: readonly PageRegionName[] = ['modal'];

/** Области, которые попадают в ссылку страницы (кроме основной). */
export const PAGE_LINKED_REGIONS: readonly PageRegionName[] = ['side'];

/** Вход приложения UI, к которому вкладка возвращается после выхода в `main`. */
export const PAGE_HOME = 'start';

/** Заметки области и подписи страницы клиента. */
export const PAGE_NOTES = {
  notFound: 'Страница не найдена',
  stale: 'Данные обновились',
  unavailable: 'Действие недоступно',
  readOnly: 'Только чтение: действие недоступно',
  closed: 'Экран закрыт',
  failed: 'Экран недоступен',
  interrupted: 'Связь прервалась — результат будет виден после переподключения',
  inbox: 'Входящие',
} as const;

/** Тексты записей `defect` вкладки: фиксированные, без данных сервера. */
export const PAGE_DEFECTS = {
  unknown: 'уведомления нет в наборе',
  badData: 'данные уведомления не по схеме',
} as const;

/** Тексты сбоев вкладки для `faults`: фиксированные, без данных экрана. */
export const PAGE_FAULTS = {
  resync: 'экран не восстановлен по новому соединению',
} as const;

/** Предел записей во входящих вкладки: старейшая вытесняется. */
export const INBOX_LIMIT = 50;

/** Предел ключей отсева повторов: старейший вытесняется. */
export const SEEN_LIMIT = 256;

/**
 * Срок ключа отсева, мс — час от первого приёма. Повтор доставки после
 * перезапуска сервера приходит при старте его очереди, то есть вскоре, —
 * часа хватает с запасом. Память держит предел ключей и без срока.
 */
export const SEEN_TTL_MS = 60 * 60 * 1000;
