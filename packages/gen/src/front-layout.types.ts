/** Технология канала: фабрики представлений, вход пакета с ними и сборка оболочки */
export type ChannelTech = {
  /** Фабрика реестра представлений модуля: `ChatViews` */
  readonly factory: string;
  /** Вход пакета с фабрикой: `dmg-ui/chat-ui` */
  readonly entry: string;
  /** Сборка реестров канала в оболочке: `AppChatViews` */
  readonly shell: string;
  /** Фабрика представления экрана: `ScreenPresenter` */
  readonly screen: string;
  /** Фабрика представления уведомления: `NotificationPresenter` */
  readonly notification: string;
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
