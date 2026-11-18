import type { ExampleRegion } from '../common/example-web.types';
import type { ExampleGestures } from '../view/example-gestures';
import type { FormDrafts } from '../view/form-drafts';
import type { DragDom } from './drag-dom';

/** Что нужно построителю тела области. */
export type BodyDomSpec = {
  readonly name: ExampleRegion;
  readonly gestures: ExampleGestures;
  readonly drafts: FormDrafts;
  readonly drag: DragDom;
  /** Перерисовать область заново: черновики формы забыты. */
  readonly redraw: () => void;
};
