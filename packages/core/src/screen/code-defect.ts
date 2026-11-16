/**
 * Дефект кода экрана или уведомления, найденный ядром. Текст — только из
 * имён (экран, действие, поле, UC), без значений: он идёт в запись
 * наблюдателя и в лог.
 */
export class CodeDefect extends Error {
  override readonly name = 'CodeDefect';

  /**
   * Безопасный текст причины: у `CodeDefect` — его текст, у чужого броска
   * (код экрана, valibot) — этап и имя ошибки без `message`.
   */
  static textOf(error: unknown, stage: string): string {
    if (error instanceof CodeDefect) return error.message;
    const name = error instanceof Error ? error.name : typeof error;
    return `${stage}: бросок ${name}`;
  }
}
