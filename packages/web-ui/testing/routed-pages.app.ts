import { type Address, UiAppDef } from 'dmg-ui';
import {
  ExampleUiSetDef,
  TASK_A,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { PAGE_CHANNEL } from 'dmg-ui/web-ui';

/** Текст входа: тексты не проверяются. */
const entry = (address: Address) => ({
  label: 'Вход',
  description: 'Вход тестового приложения.',
  address,
});

/**
 * Приложение страниц учебного набора с входом на список и входом на
 * карточку: основа тестов маршрутов с параметрами пути. Во входе
 * `testing/index.ts` не выходит.
 */
export const RoutedAppDef = UiAppDef.define({
  name: 'routedPages',
  label: 'Страницы с параметрами пути',
  description: 'Учебный набор: маршруты с параметрами пути.',
  set: ExampleUiSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: entry(TaskListScreenDef.at({ page: 0 })),
    // Адрес-заглушка: маршрут с параметром пути ведёт на вход, значение
    // входа берётся только для голого пути.
    card: entry(TaskCardScreenDef.at({ taskId: TASK_A })),
  },
});
