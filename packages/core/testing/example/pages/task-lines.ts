import type { TaskRow } from '../todo/example-tasks';

/** Строки задач в теле страницы: отметка выбора и статус. */
export class TaskLines {
  constructor(
    private readonly tasks: readonly TaskRow[],
    private readonly selected: readonly string[] | undefined,
  ) {}

  /** Строка на задачу; задач нет — `empty`. */
  text(empty: string): string {
    if (this.tasks.length === 0) return empty;
    return this.tasks.map((task) => this.line(task)).join('\n');
  }

  private line(task: TaskRow): string {
    const mark =
      this.selected === undefined
        ? '•'
        : this.selected.includes(task.uuid)
          ? '[x]'
          : '[ ]';
    const status = task.status === 'done' ? ' — выполнена' : '';
    return `${mark} ${task.title}${status}`;
  }
}
