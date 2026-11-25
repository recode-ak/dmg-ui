import type { RenderContext } from 'dmg-ui';
import { exampleSubject } from '../../platform/ui';

/** Получатель запроса в превью: любое целое положительное — чат примера. */
export const EXAMPLE_CHAT = 1;

/** Контекст примера: тот же, что по умолчанию у `ExamplePreview`, с субъектом примеров. */
export const EXAMPLE_CONTEXT: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: exampleSubject,
};
