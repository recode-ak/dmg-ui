import {
  type AnyNotificationDef,
  type AnyScreenDef,
  type RenderContext,
  ScreenPreview,
} from 'dmg-ui';
import type {
  ExamplePreviewSpec,
  ExampleRenderer,
} from './example-preview.types';

export type {
  ExamplePreviewSpec,
  ExampleRenderer,
} from './example-preview.types';

/** Контекст рендера примеров по умолчанию. */
const DEFAULT_CONTEXT: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

/**
 * Помощник рендера примеров: вид примера из Def (`ScreenPreview`
 * ядра) через представление канала — порт `ExampleRenderer`. От канала и
 * сервера не зависит; снимки делает тест (`toMatchSnapshot`). Нет примера
 * или пример не по схеме — бросок, как у `ScreenPreview`.
 */
export class ExamplePreview {
  private readonly preview: ScreenPreview;
  private readonly renderer: ExampleRenderer;
  private readonly context: RenderContext;

  constructor(spec: ExamplePreviewSpec) {
    this.preview = new ScreenPreview({ set: spec.set, codes: spec.codes });
    this.renderer = spec.renderer;
    this.context = spec.context ?? DEFAULT_CONTEXT;
  }

  async screen(def: AnyScreenDef, example: string): Promise<string> {
    return this.renderer.screen(
      await this.preview.screen(def, example, this.context),
    );
  }

  notification(def: AnyNotificationDef, example: string): string {
    return this.renderer.notification(this.preview.notification(def, example));
  }
}
