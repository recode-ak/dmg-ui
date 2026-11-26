import type { FrontLayout } from './front-layout';

/** Вид узла модуля, у которого код и представления — экран или уведомление */
export type UiNodeKind = 'screen' | 'notification';

/** Чем один вид узла отличается от другого: имена, маркеры, тело описания, заметки */
export type UiNodeSpec = {
  /** Вид: суффикс файла описания, фабрика `CodeLoader` и ключ фабрики представления канала */
  readonly kind: UiNodeKind;
  /** Что это в тексте комментария: `Экран` */
  readonly subject: string;
  /** Часть имён `<Имя><Часть>Def`, `<Имя><Часть>Code`: `Screen` */
  readonly part: string;
  /** Суффикс файла кода: `scode` */
  readonly codeSuffix: string;
  /** Список манифеста модуля и его маркер: `screens` → `// gen:screens` */
  readonly list: string;
  /** Тело `define` без отступа; name — имя в camelCase */
  readonly body: (name: string) => string[];
  /** Заметка для узла в `shared`; нет — не нужна */
  readonly sharedNote?: (def: string) => string;
  /** Заметка для узла в папке сторис, кроме экрана `start`; нет — не нужна */
  readonly storyNote?: (def: string) => string;
  /** Заметка о файле описания (путь от корня); нет — не нужна */
  readonly fileNote?: (path: string) => string;
};

/** Разобранные аргументы вида: три имени и раскладка модуля */
export type UiNodeArgs = {
  readonly module: string;
  /** Папка сторис модуля или `shared`; у `story` — сторис */
  readonly folder: string;
  /** Имя узла: экран, уведомление; у `story` — экран `start` */
  readonly name: string;
  readonly front: FrontLayout;
};

/** Названия трёх аргументов вида в сообщениях: модуль, папка, имя */
export type UiNodeLabels = readonly [
  module: string,
  folder: string,
  name: string,
];
