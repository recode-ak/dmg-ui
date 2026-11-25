/** Вид перетаскиваемого: строка списка или карточка задачи. */
export type DragKind = 'row' | 'card';

/** Разобранная полезная нагрузка перетаскивания. */
export type DragData = {
  readonly kind: DragKind;
  readonly taskId: string;
};
