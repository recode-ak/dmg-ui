import type { GenContext, GenPlan, GenProviderKind } from 'dmg-core/gen';
import { NOTIFICATION_NODE } from './ui-node.const';
import { UiNodeInput } from './ui-node-input';
import { UiNodePlan } from './ui-node-plan';

/**
 * `gen notification <модуль> <папка> <уведомление>` — пустое уведомление
 * UI-модуля: описание без `event`, код и представления каналов с шаблоном;
 * `<папка>` — сторис модуля или `shared`.
 */
export class NotificationKind implements GenProviderKind {
  readonly name = 'notification';
  readonly usage = '<модуль> <папка> <уведомление>';
  private readonly input = new UiNodeInput(this.name, this.usage, [
    'модуль',
    'папка',
    'уведомление',
  ]);

  plan(args: readonly string[], { layout }: GenContext): GenPlan {
    const { folder, name, front } = this.input.parse(args, layout);
    return new UiNodePlan(NOTIFICATION_NODE, front).plan(folder, name);
  }
}
