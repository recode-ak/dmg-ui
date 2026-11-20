/** Файл для проверки имён: путь от корня проекта через `/` и текст. */
export type UiNamesSource = { readonly path: string; readonly text: string };

/** Нарушение `NM-01`: файл (или каталог зоны), строка с 1 и текст `NM-01 <проверка>: …`. */
export type UiNamesViolation = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

/** Зоны проверки — каталоги от корня проекта; файл вне всех зон не проверяется. */
export type UiNamesLayout = {
  /** Корни наборов UI: файлы вида набора лежат в `<корень>/<m>/`, `.set` — в корне; тест рядом проверяется. */
  readonly sets: readonly string[];
  /** Каталоги стороны канала: `.ui-app`, `.view`, `.views`, `.routes`, `.placements`, `.wire`, `.graph`, `.arch`; тест рядом проверяется. */
  readonly channels?: readonly string[];
  /** Прочий код UI без раскладки по папкам (приёмка): суффикс и имя проверяются, место — нет. */
  readonly others?: readonly string[];
  /** Дополнительные каталоги, где проверяется только место тестов; в `sets` и `channels` оно проверяется и без них. */
  readonly tests?: readonly string[];
};

/** Вид файла UI из словаря `NM-01`: суффикс, сторона, ожидаемое имя и объявление. */
export type UiFileKind = {
  /** Суффикс без точек: `screen` у `<имя>.screen.ts`. */
  readonly suffix: string;
  readonly side: 'set' | 'channel';
  /** Хвост имени экспорта: `ScreenDef` даёт `<Имя>ScreenDef`. */
  readonly ending: string;
  /** Регистр головы имени: `pascal` — `TaskList…`, `camel` — `taskList…`. */
  readonly head: 'pascal' | 'camel';
  /** Объявление вида в тексте; у видов канала без базы — нет, вид только по суффиксу. */
  readonly declaration?: UiKindDeclaration;
};

/** Как вид объявлен в тексте: `<База>.define(` или `extends <База>`. */
export type UiKindDeclaration = {
  readonly base: string;
  readonly form: 'define' | 'extends';
  /** Чей суффикс назвать в тексте нарушения: `ScreenDef`, «кода экрана». */
  readonly label: string;
};
