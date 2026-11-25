import type { PageExpected } from 'dmg-ui/web-ui';

/**
 * Ожидаемый итог «Выполнить» карточки: данные вида со статусом «выполнена».
 * Чистая; полученные данные не меняет.
 */
export const completed: PageExpected = (view) => {
  const data = view.data;
  if (typeof data !== 'object' || data === null) return data;
  return { ...data, status: 'done' };
};
