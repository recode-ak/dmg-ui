import type { AnyScreenDef, InstanceView, ScreenViewOf } from 'dmg-ui';
import type {
  AnyScreenPresenter,
  CaughtTexts,
  ScreenPresenterSpec,
  ScreenText,
  ViewOutput,
} from './view.types';
import type { ViewKit } from './view-kit';

/** Представление экрана в беседе: вывод по виду, свои тексты отказов, след в истории. */
export class ScreenPresenter<D extends AnyScreenDef>
  implements AnyScreenPresenter
{
  private constructor(
    readonly def: D,
    private readonly spec: ScreenPresenterSpec<D>,
  ) {}

  /** Короткая форма: текст тела, варианты по умолчанию, свои тексты отказов по коду из `catches`. */
  static for<D extends AnyScreenDef>(
    def: D,
    text: ScreenText<D>,
    caught: CaughtTexts = {},
  ): ScreenPresenter<D> {
    return new ScreenPresenter(def, {
      render: (view, kit) => kit.message(text(view)),
      caught,
    });
  }

  /** Полная форма: сообщение или список, варианты — скрыть, переставить, переподписать; след в истории. */
  static of<D extends AnyScreenDef>(
    def: D,
    spec: ScreenPresenterSpec<D>,
  ): ScreenPresenter<D> {
    return new ScreenPresenter(def, spec);
  }

  render(view: InstanceView, kit: ViewKit): ViewOutput {
    return this.spec.render(this.typed(view), kit);
  }

  /** Код отказа — данные сервера: имена прототипа (`constructor`) — не текст. */
  caught(code: string): string | undefined {
    const texts = this.spec.caught ?? {};
    return Object.hasOwn(texts, code) ? texts[code] : undefined;
  }

  history(view: InstanceView): string | undefined {
    const key = this.spec.history;
    if (key === undefined) return undefined;
    if (key === 'address') return JSON.stringify(view.address);
    return key(this.typed(view));
  }

  private typed(view: InstanceView): ScreenViewOf<D> {
    // Единственное приведение канала (D-UI-27): `data` и `state` вида этого
    // экрана исполнитель уже проверил схемами экрана (`load`, `restore`,
    // пример `ScreenPreview`); реестр отдаёт вид только представлению его
    // экрана — по `id` из `UiIds`.
    return view as ScreenViewOf<D>;
  }
}
