import type { GenContext, GenPlan, GenProviderKind } from 'dmg-core/gen';
import { SCREEN_NODE } from './ui-node.const';
import { UiNodeInput } from './ui-node-input';
import { UiNodePlan } from './ui-node-plan';

/**
 * `gen screen <модуль> <папка> <экран>` — пустой экран UI-модуля: описание,
 * код и представления каналов с шаблоном; `<папка>` — сторис модуля или `shared`.
 */
export class ScreenKind implements GenProviderKind {
  readonly name = 'screen';
  readonly usage = '<модуль> <папка> <экран>';
  private readonly input = new UiNodeInput(this.name, this.usage, [
    'модуль',
    'папка',
    'экран',
  ]);

  plan(args: readonly string[], { layout }: GenContext): GenPlan {
    const { folder, name, front } = this.input.parse(args, layout);
    return new UiNodePlan(SCREEN_NODE, front).plan(folder, name);
  }
}
