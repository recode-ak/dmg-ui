/** Пометки области. */
export const MARK_TEXTS = {
  offline: 'Нет связи — переподключаемся',
  expecting: 'Ждём ответа…',
  refreshing: 'Обновляется…',
  loading: 'Загрузка…',
} as const;

/** Тексты пустых списков. */
export const EMPTY_TEXTS = {
  list: 'Задач пока нет.',
  assigned: 'Поручений нет.',
} as const;

/** Тексты карточки пользователя. */
export const USER_TEXTS = {
  active: 'Учётная запись активна',
  inactive: 'Учётная запись не активна',
} as const;

/** Запись входящих, которую нельзя показать: неизвестный id или данные не по схеме. */
export const NOTE_UNSHOWN = 'Уведомление не показано';

/** Фиксированная строка сбоя жеста: без данных и адресов. */
export const GESTURE_FAULT = 'Действие не выполнено';

/** Имя поля «исполнитель»: значение выбирают из людей примера. */
export const PERSON_FIELD = 'assigneeId';

/** Действия, которые пример выполняет жестом строки, а не кнопкой или формой. */
export const GESTURE_ACTIONS: readonly string[] = ['open'];

/** Подписи строки подсказки поля. */
export const FIELD_TEXTS = {
  example: 'Пример',
  limits: 'Пределы',
} as const;
