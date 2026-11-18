import type { Result } from 'dmg-core';
import type { InstanceView } from 'dmg-ui';
import type { PageExpected } from '../view/page-view-state.types';

/**
 * Проверка итога по виду области: выход — данные, которые пойдут в вид;
 * `err` — итог не годится, наложения нет.
 */
export type PageOverlayCheck = (
  view: InstanceView,
  data: unknown,
) => Result<unknown, void>;

/** Наложение итога на вид ревизии `revision`; живо, пока `holds()`. */
export type PageOverlayEntry = {
  readonly revision: number;
  readonly expected: PageExpected;
  readonly holds: () => boolean;
};
