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

/** Статус участника чата; `restricted` обязан сказать, в группе ли он (`is_member`). */
export const MemberStatusSchema = v.pipe(
  v.looseObject({
    user: UserSchema,
    status: v.picklist([
      'creator',
      'administrator',
      'member',
      'restricted',
      'left',
      'kicked',
    ]),
    is_member: v.optional(v.boolean()),
  }),
  v.check(
    (member) =>
      member.status !== 'restricted' || member.is_member !== undefined,
  ),
);

/** Смена статуса участника (`chat_member`) или самого бота (`my_chat_member`): кто, где, был и стал. */
export const ChatMemberUpdatedSchema = v.looseObject({
  chat: ChatSchema,
  from: UserSchema,
  old_chat_member: MemberStatusSchema,
  new_chat_member: MemberStatusSchema,
});

/** Заявка на вступление: чат и подавший заявку. */
export const JoinRequestSchema = v.looseObject({
  chat: ChatSchema,
  from: UserSchema,
});

/** Апдейт: прочие виды (`edited_message`, `channel_post`) не читаются. */
export const TelegramUpdateSchema = v.looseObject({
  update_id: IdSchema,
  message: v.optional(TelegramMessageSchema),
  callback_query: v.optional(CallbackQuerySchema),
  my_chat_member: v.optional(ChatMemberUpdatedSchema),
  chat_member: v.optional(ChatMemberUpdatedSchema),
  chat_join_request: v.optional(JoinRequestSchema),
});

/** id нажатия апдейта не по схеме: ответ на нажатие обязателен и тогда. */
export const PressIdSchema = v.looseObject({
  callback_query: v.looseObject({ id: v.pipe(v.string(), v.minLength(1)) }),
});
