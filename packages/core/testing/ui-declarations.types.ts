import type { UiFileKind } from './ui-file-names.types';

/** Объявление вида с базой в тексте файла: вид, имя экспорта, строка с 1. */
export type UiDeclaration = {
  readonly kind: UiFileKind;
  readonly name: string;
  readonly line: number;
};

/** Экспорт по имени: имя и строка с 1. */
export type UiExport = { readonly name: string; readonly line: number };
