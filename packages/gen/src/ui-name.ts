/**
 * Имя модуля или канала UI в kebab-case и производные от него для шаблонов:
 * `my-courses` → `MyCourses` (описание, классы) и `myCourses` (реестры).
 */
export class UiName {
  private static readonly KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

  /** Имя в kebab-case: a-z, 0-9, дефисы между частями */
  static isKebab(value: string): boolean {
    return UiName.KEBAB.test(value);
  }

  /** «a, b и c» */
  static listed(items: readonly string[]): string {
    const last = items.at(-1) ?? '';
    return items.length < 2
      ? last
      : `${items.slice(0, -1).join(', ')} и ${last}`;
  }

  constructor(readonly kebab: string) {}

  /** `my-courses` → `MyCourses` */
  pascal(): string {
    return this.kebab
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  /** `my-courses` → `myCourses` */
  camel(): string {
    const pascal = this.pascal();
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
  }
}
