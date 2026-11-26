import type { PlannedEdit } from 'dmg-core/gen';

/** Правки плана: порядок и связь по целевому файлу */
export class PlannedEdits {
  constructor(private readonly edits: readonly PlannedEdit[]) {}

  /**
   * Правки сгруппированы по файлам в порядке появления файлов; импорты — перед
   * элементами списков; `group` — путь файла: не встал импорт — элемент
   * списка того же файла тоже уходит в «Вставь вручную».
   */
  linked(): PlannedEdit[] {
    const paths = [...new Set(this.edits.map((edit) => edit.path))];
    const isImport = (edit: PlannedEdit) => edit.marker === '// gen:imports';
    return paths.flatMap((path) => {
      const own = this.edits.filter((edit) => edit.path === path);
      return [...own.filter(isImport), ...own.filter((e) => !isImport(e))].map(
        (edit) => ({ ...edit, group: path }),
      );
    });
  }
}
