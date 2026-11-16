import * as v from 'valibot';

/** Вид узла UC в графе домена. */
export const UC_KIND = 'useCase';

/** Вид ребра домена «UC отказывает ошибкой». */
export const FAILS_WITH_KIND = 'failsWith';

/** Вид узла события в графе домена. */
export const EVENT_KIND = 'event';

/**
 * Что правила читают из свойств узла UC: тип и допущенные вызывающие.
 * Остальные свойства домена не нужны, поэтому схема нестрогая.
 */
export const UC_VIEW = v.looseObject({
  type: v.picklist(['command', 'query']),
  callers: v.array(v.string()),
});

/** Что правила читают из свойств узла события: схему payload. */
export const EVENT_VIEW = v.looseObject({
  payload: v.record(v.string(), v.unknown()),
});
