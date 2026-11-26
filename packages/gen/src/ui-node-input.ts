import { GenError, type GenLayout } from 'dmg-core/gen';
import { FrontLayout } from './front-layout';
import { UiName } from './ui-name';
import type { UiNodeArgs, UiNodeLabels } from './ui-node.types';

/**
 * Аргументы вида «модуль, папка, имя»: число, kebab-case, раскладка слоёв
 * (`ui`, `fe-logic`), проверка вида и лишние аргументы — в этом порядке.
 */
export class UiNodeInput {
  constructor(
    private readonly kind: string,
    private readonly usage: string,
    private readonly labels: UiNodeLabels,
  ) {}

  /** Разбирает аргументы; verify — проверка вида после раскладки, до лишних аргументов */
  parse(
    args: readonly string[],
    layout: GenLayout,
    verify: (parsed: UiNodeArgs) => void = () => undefined,
  ): UiNodeArgs {
    const [module, folder, name, ...extra] = args;
    if (module === undefined || folder === undefined || name === undefined) {
      throw new GenError(
        `Для «${this.kind}» нужны ${UiName.listed(this.labels)} — ${this.kind} ${this.usage}`,
      );
    }
    [module, folder, name].forEach((value, i) => {
      if (!UiName.isKebab(value)) {
        throw this.refusal(
          `${this.labels[i]} «${value}» — имя в kebab-case (a-z, 0-9, дефисы)`,
        );
      }
    });
    const parsed = {
      module,
      folder,
      name,
      front: new FrontLayout(layout, module),
    };
    verify(parsed);
    if (extra.length > 0) {
      throw this.refusal(`лишние аргументы — ${this.kind} ${this.usage}`);
    }
    return parsed;
  }

  /** Отказ вида: `<вид>: <текст>` */
  refusal(message: string): GenError {
    return new GenError(`${this.kind}: ${message}`);
  }
}
