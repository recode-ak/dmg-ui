/** Постоянные поля апдейтов построителя: время сообщения (секунды Unix), имя человека, экземпляр чата нажатия. */
export const TEST_UPDATES = {
  date: 1_700_000_000,
  firstName: 'Тест',
  chatInstance: '-1',
  /** id бота в апдейтах `my_chat_member`: статус самого бота. */
  botId: 7_350_000_001,
  groupTitle: 'Группа',
} as const;
