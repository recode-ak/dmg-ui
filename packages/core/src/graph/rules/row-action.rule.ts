import { toJsonSchema } from 'dmg-core';
import type { GraphRule } from 'dmg-core/graph';
import { UiIds } from '../../address/ui-ids';
import type { ScreenAction } from '../../manifest/screen-action';
import type { AnyScreenDef, RowSpec } from '../../manifest/screen-def.types';
import type { AnyUiSetDef } from '../../manifest/ui-set-def.types';

/** Узел JSON Schema: произвольный объект, каждый шаг сужается проверкой. */
type SchemaNode = Readonly<Record<string, unknown>>;

/**
 * UI-38: форма действия строки. Путь `list` ведёт к массиву в данных экрана
 * (через `properties`, необязательные родители допустимы), элемент — объект
 * (не `anyOf`) с полями `key` и `label`, `label` — строка; у `input` ровно
 * одно поле; на одном списке экрана — не больше одного действия строки.
 * Правило по Def, как UI-20: схемы данных экрана в `props` графа нет, она
 * нормализуется здесь (`toJsonSchema`).
 */
export class RowActionRule implements GraphRule {
  readonly id = 'UI-38';

  constructor(private readonly set: AnyUiSetDef) {}

  check(): readonly string[] {
    const ids = new UiIds(this.set);
    const found: string[] = [];
    for (const module of this.set.modules) {
      for (const screen of module.screens) {
        found.push(...this.screenLines(ids, screen));
      }
    }
    return found;
  }

  private screenLines(ids: UiIds, screen: AnyScreenDef): string[] {
    const found: string[] = [];
    const byList = new Map<string, string[]>();
    const data = toJsonSchema(screen.data) as SchemaNode;
    for (const action of Object.values<ScreenAction>(screen.actions)) {
      const { row } = action;
      if (row === undefined) continue;
      const head = `действие ${ids.action(screen, action.name)}`;
      const shape = RowActionRule.shapeIssue(data, row);
      if (shape !== undefined) found.push(`${head}: ${shape}`);
      const fields = Object.keys(action.input?.entries ?? {}).length;
      if (fields !== 1) {
        found.push(
          `${head}: у входа действия строки полей ${fields}, нужно одно`,
        );
      }
      byList.set(row.list, [...(byList.get(row.list) ?? []), action.name]);
    }
    for (const [list, names] of byList) {
      if (names.length < 2) continue;
      found.push(
        `экран ${ids.screen(screen)}: на списке ${list} несколько действий строки (${names.join(', ')}), допустимо одно`,
      );
    }
    return found;
  }

  /** Что не так с путём и элементом списка; всё по форме — `undefined`. */
  private static shapeIssue(
    data: SchemaNode,
    row: RowSpec,
  ): string | undefined {
    let at: SchemaNode | undefined = data;
    for (const step of row.list.split('.')) {
      at = RowActionRule.child(at, step);
      if (at === undefined) return `пути ${row.list} нет в данных экрана`;
    }
    if (at.type !== 'array') return `путь ${row.list} ведёт не к массиву`;
    const item = RowActionRule.record(at.items);
    if (item === undefined || item.type !== 'object') {
      return `элемент списка ${row.list} не объект`;
    }
    if (RowActionRule.child(item, row.key) === undefined) {
      return `у элемента списка ${row.list} нет поля ключа ${row.key}`;
    }
    if (RowActionRule.child(item, row.label)?.type !== 'string') {
      return `поле подписи ${row.label} элемента списка ${row.list} не строка`;
    }
    return undefined;
  }

  private static child(node: SchemaNode | undefined, name: string) {
    const properties = RowActionRule.record(node?.properties);
    return properties === undefined
      ? undefined
      : RowActionRule.record(properties[name]);
  }

  private static record(value: unknown): SchemaNode | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as SchemaNode)
      : undefined;
  }
}
