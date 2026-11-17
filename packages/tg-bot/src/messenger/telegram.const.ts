import type { MessengerCapabilities } from 'dmg-ui/chat-ui';

/**
 * Возможности Telegram (D-UI-61). Единица текста не названа в Bot API —
 * `utf16`, самая строгая из мер для не-BMP; число кнопок и длина подписи не
 * подтверждены — 100 и 64. Сообщество: пять сигналов, операции `exclude` и
 * `approve`; `invite` не объявлена (CH-03 запретит такую реакцию).
 */
export const TELEGRAM_CAPABILITIES: MessengerCapabilities = {
  name: 'telegram',
  kinds: ['text'],
  edit: true,
  text: { max: 4096, unit: 'utf16' },
  textWithOptions: { max: 4096, unit: 'utf16' },
  options: { max: 100, label: { max: 64, unit: 'utf16' }, ref: 64 },
  pressAnswer: { max: 200, unit: 'utf16' },
  form: false,
  initiative: { kind: 'afterContact' },
  community: {
    signals: ['joined', 'left', 'added', 'removed', 'requested'],
    operations: ['exclude', 'approve'],
  },
};

/** Тексты Telegram: заглушка пустого текста (Bot API требует 1–4096) и метка строки выбора ушедшего экрана. */
export const TELEGRAM_TEXTS = {
  empty: '…',
  chosen: 'Вы выбрали: ',
} as const;

/** Пределы Bot API и лога. */
export const TELEGRAM_LIMITS = {
  /** Текст сообщения, UTF-16. */
  text: 4096,
  /** `callback_data`, байт UTF-8. */
  callbackData: 64,
  /** Описание отказа в логе, знаков. */
  description: 200,
} as const;

/** Разделитель между текстом ушедшего экрана и строкой выбора. */
export const CHOSEN_SEPARATOR = '\n\n';

/**
 * Адрес ссылки — `http`, `https` и из `tg` только `tg://resolve` и `tg://user`
 * (профиль): `tg://login`, `tg://proxy`, `tg://join` под чужой подписью —
 * фишинг. Прочее остаётся текстом без ссылки.
 */
export const LINK_SCHEMES =
  /^(?:https?:\/\/\S+|tg:\/\/(?:resolve|user)(?:\?\S*)?)$/i;

/** Каноническое десятичное целое > 0: собеседник (личный чат), `message_id`, участник группы. */
export const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/** Каноническое десятичное целое < 0: группа и супергруппа. */
export const NEGATIVE_INTEGER = /^-[1-9][0-9]*$/;

/** Предпросмотр ссылок выключен у всех сообщений. */
export const NO_PREVIEW = { is_disabled: true } as const;
