import type { RegionModel } from '../../../frontend/web-kit/region-model.types';
import type { ExampleRegion } from '../common/example-web.types';
import type { ExampleGestures } from '../view/example-gestures';
import type { FormDrafts } from '../view/form-drafts';
import type { RegionFrame } from '../view/region-frame';
import type { DragDom } from './drag-dom';

/** Сборка показа одной области. */
export type RegionDomSpec = {
  readonly name: ExampleRegion;
  readonly frame: RegionFrame;
  readonly drafts: FormDrafts;
  readonly gestures: ExampleGestures;
  readonly drag: DragDom;
  /** Закрытие области кнопкой; без него кнопки нет. */
  readonly close?: () => void;
  /** Текст пустой области. */
  readonly placeholder?: string;
  /** Новая модель области показана. */
  readonly onModel?: (model: RegionModel) => void;
};
