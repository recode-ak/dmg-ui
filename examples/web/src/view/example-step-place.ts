import type { AddressJson } from 'dmg-ui';
import { LIST_ID } from 'dmg-ui/testing';

/**
 * Правило шага учебного приложения (`PageClientSpec.stepPlace`, D-UI-104):
 * листание списка задач — шаг истории, «Назад» браузера возвращает прежнюю
 * страницу. Ключ списка включает его параметры (только страница), остальные
 * экраны — по экрану, как у ядра (D-UI-97). Объект, а не класс:
 * преобразование без состояния (biome `noStaticOnlyClass`).
 * @see ./example-step-place.test.ts
 */
export const ExampleStepPlace = {
  /** Ключ места по адресу корня. */
  key(address: AddressJson): string {
    if (address.screen !== LIST_ID) return address.screen;
    return JSON.stringify([address.screen, address.params]);
  },
};
