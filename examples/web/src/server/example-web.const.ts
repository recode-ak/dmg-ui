import type { PersonPlaces } from 'dmg-ui/server';

/** Место людей примера: часовой пояс момента из карточки задачи. */
export const PLACES: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};
