/** Нарушение структурной проверки: файл, номер строки (с 1) и текст, поясняющий нарушение. */
export type Violation = {
  file: string;
  line: number;
  text: string;
};
