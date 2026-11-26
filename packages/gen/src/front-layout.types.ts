/** Технология канала: фабрика реестра представлений, её вход и сборка оболочки */
export type ChannelTech = {
  /** Фабрика реестра представлений модуля: `ChatViews` */
  readonly factory: string;
  /** Вход пакета с фабрикой: `dmg-ui/chat-ui` */
  readonly entry: string;
  /** Сборка реестров канала в оболочке: `AppChatViews` */
  readonly shell: string;
};

/** Канал модуля — слой `fe-<канал>` из `layers` проекта */
export type FrontChannel = {
  /** Имя канала: `chat` */
  readonly name: string;
  /** Имя слоя: `fe-chat` */
  readonly layer: string;
  /** Каталог канала модуля от корня проекта, `{m}` подставлен */
  readonly dir: string;
  /** Технология канала; нет — шаблона реестра для канала нет */
  readonly tech?: ChannelTech;
};
