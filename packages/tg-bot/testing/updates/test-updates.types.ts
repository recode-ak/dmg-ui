/** Человек Telegram в апдейте. */
export type TestUser = {
  readonly id: number;
  readonly is_bot: false;
  readonly first_name: string;
};

/** Личный чат: id чата равен id человека. */
export type TestPrivateChat = {
  readonly id: number;
  readonly type: 'private';
};

/** Сущность команды в начале текста. */
export type TestCommandEntity = {
  readonly type: 'bot_command';
  readonly offset: 0;
  readonly length: number;
};

/** Апдейт с текстом личного чата. */
export type TestTextUpdate = {
  readonly update_id: number;
  readonly message: {
    readonly message_id: number;
    readonly date: number;
    readonly chat: TestPrivateChat;
    readonly from: TestUser;
    readonly text: string;
    readonly entities?: readonly TestCommandEntity[];
  };
};

/** Апдейт нажатия кнопки на сообщении личного чата. */
export type TestPressUpdate = {
  readonly update_id: number;
  readonly callback_query: {
    readonly id: string;
    readonly from: TestUser;
    readonly chat_instance: string;
    readonly message: {
      readonly message_id: number;
      readonly date: number;
      readonly chat: TestPrivateChat;
    };
    readonly data: string;
  };
};
