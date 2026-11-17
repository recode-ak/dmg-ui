import * as v from 'valibot';

// Схема апдейта Bot API (D-UI-62): пакет не верит транспорту — читаются
// только нужные поля, по типу; лишние поля не мешают.

const IdSchema = v.pipe(v.number(), v.safeInteger());

const ChatSchema = v.looseObject({ id: IdSchema, type: v.string() });

const UserSchema = v.looseObject({ id: IdSchema });

const FileSchema = v.looseObject({ file_id: v.string() });

const PhotoSizeSchema = v.looseObject({
  file_id: v.string(),
  width: v.number(),
  height: v.number(),
});

const EntitySchema = v.looseObject({
  type: v.string(),
  offset: v.pipe(v.number(), v.integer()),
  length: v.pipe(v.number(), v.integer()),
});

/** Сообщение: чат, отправитель, текст с сущностями, вложения. */
export const TelegramMessageSchema = v.looseObject({
  chat: ChatSchema,
  from: v.optional(UserSchema),
  text: v.optional(v.string()),
  entities: v.optional(v.array(EntitySchema)),
  photo: v.optional(v.array(PhotoSizeSchema)),
  animation: v.optional(FileSchema),
  video: v.optional(FileSchema),
  video_note: v.optional(FileSchema),
  document: v.optional(FileSchema),
  audio: v.optional(FileSchema),
  voice: v.optional(FileSchema),
});

/** Нажатие: без `message` — инлайн-режим, без `data` — игра. */
export const CallbackQuerySchema = v.looseObject({
  id: v.pipe(v.string(), v.minLength(1)),
  from: UserSchema,
  message: v.optional(v.looseObject({ chat: ChatSchema })),
  data: v.optional(v.string()),
});

/** Апдейт: прочие виды (`edited_message`, `channel_post`, апдейты участников) не читаются. */
export const TelegramUpdateSchema = v.looseObject({
  update_id: IdSchema,
  message: v.optional(TelegramMessageSchema),
  callback_query: v.optional(CallbackQuerySchema),
});

/** id нажатия апдейта не по схеме: ответ на нажатие обязателен и тогда. */
export const PressIdSchema = v.looseObject({
  callback_query: v.looseObject({ id: v.pipe(v.string(), v.minLength(1)) }),
});
