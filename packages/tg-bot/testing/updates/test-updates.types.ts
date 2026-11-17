/** Человек Telegram в апдейте; у статуса самого бота — `is_bot`. */
export type TestUser = {
  readonly id: number;
  readonly is_bot: boolean;
  readonly first_name: string;
};

/** Супергруппа: id отрицательный. */
export type TestGroupChat = {
  readonly id: number;
  readonly type: 'supergroup';
  readonly title: string;
};

/** Статус участника: `left` или `member`. */
export type TestMemberStatus = {
  readonly user: TestUser;
  readonly status: 'left' | 'member';
};

/** Смена статуса участника (`chat_member`) или бота (`my_chat_member`). */
export type TestMemberChange = {
  readonly chat: TestGroupChat;
  readonly from: TestUser;
  readonly date: number;
  readonly old_chat_member: TestMemberStatus;
  readonly new_chat_member: TestMemberStatus;
};

/** Апдейт `chat_member`. */
export type TestChatMemberUpdate = {
  readonly update_id: number;
  readonly chat_member: TestMemberChange;
};

/** Апдейт `my_chat_member`. */
export type TestMyChatMemberUpdate = {
  readonly update_id: number;
  readonly my_chat_member: TestMemberChange;
};

/** Апдейт `chat_join_request`. */
export type TestJoinRequestUpdate = {
  readonly update_id: number;
  readonly chat_join_request: {
    readonly chat: TestGroupChat;
    readonly from: TestUser;
    readonly user_chat_id: number;
    readonly date: number;
  };
};

/** Апдейт с текстом группы. */
export type TestGroupTextUpdate = {
  readonly update_id: number;
  readonly message: {
    readonly message_id: number;
    readonly date: number;
    readonly chat: TestGroupChat;
    readonly from: TestUser;
    readonly text: string;
    readonly entities?: readonly TestCommandEntity[];
  };
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
