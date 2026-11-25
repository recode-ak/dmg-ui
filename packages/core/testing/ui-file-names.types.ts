/** Файл для проверки имён: путь от корня проекта через `/` и текст. */
export type UiNamesSource = { readonly path: string; readonly text: string };

/** Нарушение `NM-01`: файл (или каталог зоны), строка с 1 и текст `NM-01 <проверка>: …`. */
export type UiNamesViolation = {
  readonly file: string;
  readonly line: number;
  readonly text: string;
};

/**
 * Зоны проверки — каталоги от корня проекта; файл вне всех зон не проверяется, зона
 * без файлов — нарушение. `logic` и `channels` — шаблоны с одним `{m}` (имя UI-модуля,
 * один сегмент пути), остальные поля — каталоги без шаблона.
 */
export type UiNamesLayout = {
  /** Корень описания: `.set` и помощники в корне, `<m>/<m>.ui-module.ts`, папки сторис `<m>/<сторис>/` и `<m>/shared/`. */
  readonly ui: string;
  /** Код модуля, шаблон с `{m}`: `.scode` и `.ncode` — парой экрану и уведомлению описания по тому же пути. */
  readonly logic: string;
  /** Каналы модуля, шаблоны с `{m}`: `.view` — парой по тому же пути, реестр `.views` — в корне. */
  readonly channels: readonly string[];
  /** Общие кирпичи без хозяина: видов UI в них нет. */
  readonly kits?: readonly string[];
  /** Оболочки (раннеры): из видов UI — только `.ui-app`, `.graph`, `.arch`, `.routes`, `.placements`, `.wire`. */
  readonly shells?: readonly string[];
  /** Прочий код UI без раскладки (приёмка, подмены кода): суффикс и имя проверяются, место — нет. */
  readonly others?: readonly string[];
  /** Дополнительные каталоги, где проверяется только тест рядом; в зонах, кроме `others`, он проверяется и без них. */
  readonly tests?: readonly string[];
};

/** Зона, где вид UI на своём месте: описание, код модуля, канал модуля, оболочка. */
export type UiKindZone = 'ui' | 'logic' | 'channel' | 'shell';

/** Поле конфигурации, к которому относится зона. */
export type UiZoneField = UiKindZone | 'kit' | 'other' | 'tests';

/** Вид файла UI из словаря `NM-01`: суффикс, зона, ожидаемое имя и объявление. */
export type UiFileKind = {
  /** Суффикс без точек: `screen` у `<имя>.screen.ts`. */
  readonly suffix: string;
  /** Где вид на своём месте; в другой зоне — нарушение места. */
  readonly zone: UiKindZone;
  /** Суффиксы пары в описании по тому же пути (`.scode` → `screen`); вид кода или канала модуля без пары — реестр в корне зоны. */
  readonly pairs?: readonly string[];
  /** Хвост имени экспорта: `ScreenDef` даёт `<Имя>ScreenDef`. */
  readonly ending: string;
  /** Регистр головы имени: `pascal` — `TaskList…`, `camel` — `taskList…`. */
  readonly head: 'pascal' | 'camel';
  /** Объявление вида в тексте; у видов без базы — нет, вид только по суффиксу. */
  readonly declaration?: UiKindDeclaration;
};

/** Как вид объявлен в тексте: `<База>.define(` или `extends <База>`. */
export type UiKindDeclaration = {
  readonly base: string;
  readonly form: 'define' | 'extends';
  /** Чей суффикс назвать в тексте нарушения: `ScreenDef`, «кода экрана». */
  readonly label: string;
};

/** Зона конфигурации: поле, шаблон без хвостового `/` и выражение пути файла в ней. */
export type UiNamesZone = {
  readonly field: UiZoneField;
  readonly template: string;
  /** `^<каталог>/(.+)$`; у шаблона с `{m}` первая группа — модуль, вторая — путь внутри. */
  readonly pattern: RegExp;
};

/** Файл в зоне: поле, каталог зоны (с подставленным модулем), модуль шаблона и путь внутри по сегментам. */
export type UiZoneHit = {
  readonly field: UiZoneField;
  readonly dir: string;
  /** Имя UI-модуля из `{m}` — только у `logic` и `channels`. */
  readonly module?: string;
  readonly rest: readonly string[];
};

/** Части пути файла: каталог, имя с расширением, `<имя>` до первой точки, суффикс между ней и `.ts`. */
export type UiFilePath = {
  readonly path: string;
  readonly dir: string;
  readonly base: string;
  readonly name: string;
  readonly suffix: string | undefined;
};

/** Зона, где проверяется место файла. */
export type UiPlaceZone = UiKindZone | 'kit';

/** Слова зоны в тексте нарушения: `of` — чей вид, `at` — где лежит файл. */
export type UiZoneWords = { readonly of: string; readonly at: string };
