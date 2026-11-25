/**
 * Личность примера (D-UI-68): id Telegram (строка `String(from.id)`) ↔ uuid
 * учебного мира. Первый id списка — пользователь A, второй — B; список короче
 * двух оставляет лишних пользователей без id.
 */
export class ExamplePeople {
  constructor(
    protected readonly ids: readonly number[],
    protected readonly uuids: readonly string[],
  ) {}

  /** uuid по id Telegram; чужой, пустой и не целочисленный id — `undefined`. */
  uuidOf(telegramId: string | undefined): string | undefined {
    if (telegramId === undefined || !/^\d+$/.test(telegramId)) return undefined;
    const index = this.ids.indexOf(Number(telegramId));
    return index < 0 ? undefined : this.uuids[index];
  }

  /** id Telegram строкой по uuid; неизвестный uuid или человек вне списка — `undefined`. */
  idOf(uuid: string): string | undefined {
    const index = this.uuids.indexOf(uuid);
    const id = index < 0 ? undefined : this.ids[index];
    return id === undefined ? undefined : String(id);
  }
}
