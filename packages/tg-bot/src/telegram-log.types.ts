/** Операция порта мессенджера — в записи лога. */
export type TelegramOperation =
  | 'show'
  | 'update'
  | 'retire'
  | 'notify'
  | 'publishMenu'
  | 'exclude'
  | 'approve'
  | 'invite';
