/**
 * Объект из недоверенного JSON для чтения по ключам; не объект — пустой.
 * Функция, а не класс: преобразование без состояния (biome `noStaticOnlyClass`).
 */
export function jsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : {};
}
