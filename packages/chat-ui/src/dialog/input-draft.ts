import type { ActionField, Choice } from 'dmg-ui';

/**
 * Вход действия по шагам: поля по порядку, текущее — первое без ответа.
 * Текст — строка, у поля с вариантами — `Choice.value` (по нажатию или по
 * подписи); необязательное поле можно пропустить. Другие типы полей (число,
 * дата) не поддержаны: их значение собирается строкой и отвергается
 * схемой ядра.
 */
export class InputDraft {
  private readonly fields: readonly ActionField[];
  private readonly values = new Map<string, Choice['value']>();
  private readonly answered = new Set<string>();

  constructor(fields: readonly ActionField[]) {
    this.fields = fields;
  }

  /** Поле, которое ждёт ответа; все отвечены — `undefined`. */
  current(): ActionField | undefined {
    return this.fields.find((field) => !this.answered.has(field.name));
  }

  /** Все поля отвечены — вход готов к одному `act`. */
  done(): boolean {
    return this.current() === undefined;
  }

  /**
   * Свободный текст текущему полю: у поля с вариантами — вариант с такой
   * подписью; подписи нет — `false`, поле ждёт дальше.
   */
  answer(text: string): boolean {
    const field = this.expect('answer');
    if (field.choices === undefined) {
      this.fill(field, text);
      return true;
    }
    const choice = field.choices.find((c) => c.label === text);
    if (choice === undefined) return false;
    this.fill(field, choice.value);
    return true;
  }

  /** Нажатый вариант текущего поля. */
  choose(value: Choice['value']): void {
    this.fill(this.expect('choose'), value);
  }

  /** «Пропустить» необязательное поле; обязательное — ошибка канала, бросок. */
  skip(): void {
    const field = this.expect('skip');
    if (!field.optional) {
      throw new Error(`InputDraft: поле ${field.name} обязательное`);
    }
    this.values.delete(field.name);
    this.answered.add(field.name);
  }

  /** Повтор поля по замечанию `rejected`; поля нет во входе — `false`. */
  repeat(name: string): boolean {
    if (!this.fields.some((field) => field.name === name)) return false;
    this.answered.delete(name);
    return true;
  }

  /** Собранный вход: пропущенных полей в нём нет. */
  input(): Readonly<Record<string, Choice['value']>> {
    return Object.fromEntries(this.values);
  }

  private fill(field: ActionField, value: Choice['value']): void {
    this.values.set(field.name, value);
    this.answered.add(field.name);
  }

  /** Текущее поле; вход уже собран — ошибка канала, бросок. */
  private expect(what: string): ActionField {
    const field = this.current();
    if (field === undefined) {
      throw new Error(`InputDraft: ${what} — все поля уже отвечены`);
    }
    return field;
  }
}
