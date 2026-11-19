import { type ActionField, FieldInput } from 'dmg-ui';
import type { ChoiceValue, DraftJson, Serial } from './conversation.types';

/** Строка номера варианта: только цифры. */
const NUMBER = /^[0-9]+$/;

/**
 * Вход действия по шагам — над данными черновика `DraftJson` (D-UI-47):
 * поля по порядку, текущее — первое без ответа. Текст — строка, у поля с
 * вариантами — `Choice.value` по нажатию, подписи или номеру `1…n`;
 * необязательное поле можно пропустить. Строку ответа приводит к виду поля
 * `FieldInput` ядра: число из текста — числом, остальное строкой; что не
 * приведено, отвергает схема своим текстом. Варианты (в том числе неявные
 * «Да» и «Нет» булева) приведение обходят.
 * @see input-draft.test.ts
 */
export class InputDraft {
  private readonly values: Map<string, ChoiceValue>;
  private readonly answered: Set<string>;
  private page: number;

  private constructor(private readonly json: DraftJson) {
    this.values = new Map(Object.entries(json.values));
    this.answered = new Set(json.answered);
    this.page = json.page;
  }

  /** Новый черновик `serial` для цели экрана `screen`: ответов нет, страница 0. */
  static start(
    serial: Serial,
    screen: Serial,
    target: DraftJson['target'],
    fields: readonly ActionField[],
  ): InputDraft {
    return new InputDraft({
      serial,
      screen,
      target,
      fields,
      values: {},
      answered: [],
      page: 0,
    });
  }

  /** Черновик из данных снимка. */
  static of(json: DraftJson): InputDraft {
    return new InputDraft(json);
  }

  /** Номер черновика беседы. */
  serial(): Serial {
    return this.json.serial;
  }

  /** Номер экрана, чьё действие собирается. */
  screen(): Serial {
    return this.json.screen;
  }

  /** Цель черновика: действие или локальное действие с ревизией показа. */
  target(): DraftJson['target'] {
    return this.json.target;
  }

  /** Страница вариантов текущего поля. */
  shownPage(): number {
    return this.page;
  }

  /** Поле, которое ждёт ответа; все отвечены — `undefined`. */
  current(): ActionField | undefined {
    return this.json.fields.find((field) => !this.answered.has(field.name));
  }

  /** Все поля отвечены — вход готов к одному исполнению. */
  done(): boolean {
    return this.current() === undefined;
  }

  /** Текст текущему полю: без вариантов — строка; с вариантами — по подписи, затем по номеру `1…n`. Не подошло — false. */
  answer(text: string): boolean {
    const field = this.expect('answer');
    if (field.choices === undefined) {
      this.fill(field, new FieldInput(field).value(text));
      return true;
    }
    const choice =
      field.choices.find((c) => c.label === text) ??
      (NUMBER.test(text) ? field.choices[Number(text) - 1] : undefined);
    if (choice === undefined) return false;
    this.fill(field, choice.value);
    return true;
  }

  /** Нажатый вариант текущего поля. */
  choose(value: ChoiceValue): void {
    this.fill(this.expect('choose'), value);
  }

  /** «Пропустить» необязательное поле; обязательное — дефект беседы, бросок. */
  skip(): void {
    const field = this.expect('skip');
    if (!field.optional) {
      throw new Error(`InputDraft: поле ${field.name} обязательное`);
    }
    this.values.delete(field.name);
    this.answered.add(field.name);
    this.page = 0;
  }

  /** Повтор поля по замечанию `rejected`; поля нет во входе — false. */
  repeat(name: string): boolean {
    if (!this.json.fields.some((field) => field.name === name)) return false;
    this.answered.delete(name);
    this.page = 0;
    return true;
  }

  /** Страница вариантов текущего поля; сбрасывается на 0 при переходе к следующему полю. */
  turn(page: number): void {
    this.page = page;
  }

  /** Собранный вход: пропущенных полей в нём нет. */
  input(): Readonly<Record<string, ChoiceValue>> {
    return Object.fromEntries(this.values);
  }

  /** Черновик с ревизией цели `to` вместо `from` (вид после восстановления совпал); иначе — тот же. */
  rebased(from: number, to: number): InputDraft {
    const json = this.toJSON();
    if (json.target.revision !== from) return this;
    return new InputDraft({
      ...json,
      target: { ...json.target, revision: to },
    });
  }

  toJSON(): DraftJson {
    return {
      ...this.json,
      values: Object.fromEntries(this.values),
      answered: [...this.answered],
      page: this.page,
    };
  }

  private fill(field: ActionField, value: ChoiceValue): void {
    this.values.set(field.name, value);
    this.answered.add(field.name);
    this.page = 0;
  }

  /** Текущее поле; вход уже собран — дефект беседы, бросок. */
  private expect(what: string): ActionField {
    const field = this.current();
    if (field === undefined) {
      throw new Error(`InputDraft: ${what} — все поля уже отвечены`);
    }
    return field;
  }
}
