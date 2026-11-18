import type { AnyScreenDef, InstanceView, ScreenViewOf } from 'dmg-ui';
import type { ExampleBodyBuild } from './example-screen-view.types';
import type { AnyExampleScreen } from './example-views.types';
import type { ScreenBody, ScreenControls } from './region-model.types';

/** Представление экрана на DOM: тело (чистые данные) по виду экземпляра. */
export class ExampleScreenView<D extends AnyScreenDef>
  implements AnyExampleScreen
{
  private constructor(
    readonly def: D,
    private readonly build: ExampleBodyBuild<D>,
  ) {}

  static for<D extends AnyScreenDef>(
    def: D,
    build: ExampleBodyBuild<D>,
  ): ExampleScreenView<D> {
    return new ExampleScreenView(def, build);
  }

  body(view: InstanceView, controls: ScreenControls): ScreenBody {
    // Единственное приведение: `data` и `state` вида исполнитель уже проверил
    // схемами экрана; реестр отдаёт вид только представлению его экрана.
    return this.build(view as ScreenViewOf<D>, controls);
  }
}
