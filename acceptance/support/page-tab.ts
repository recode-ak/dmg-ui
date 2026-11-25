import { ExampleUiSetDef } from 'dmg-ui/example';
import { type PageClient, PageFormModel, type PageWire } from 'dmg-ui/web-ui';
import * as v from 'valibot';

/** Область основной вкладки: данные вида со списком задач. */
const TasksData = v.object({
  tasks: v.array(v.object({ title: v.string() })),
});

/**
 * Вкладка человека на странице приёмки: клиент на проводе в памяти. Даёт
 * то, что человек видит в основной области: формы с доступностью и
 * причиной, поля действий, названия задач списка.
 */
export class PageTab {
  constructor(
    readonly client: PageClient,
    readonly wire: PageWire,
  ) {}

  /** Формы основной области: `available` и причина `reason`. */
  forms() {
    return new PageFormModel(ExampleUiSetDef).of(this.client.region('main'))
      .forms;
  }

  form(name: string) {
    return this.forms().find((form) => form.name === name);
  }

  /** Поле `name` действия `action` в виде основной области. */
  field(action: string, name: string) {
    return this.client
      .region('main')
      .view?.actions.find((a) => a.name === action)
      ?.fields.find((f) => f.name === name);
  }

  /** Названия задач в данных вида основной области. */
  titles(): string[] {
    return v
      .parse(TasksData, this.client.region('main').view?.data)
      .tasks.map((task) => task.title);
  }
}
