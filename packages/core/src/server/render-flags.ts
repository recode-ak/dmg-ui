import { type Caller, DelegateCaller, type Identified } from 'dmg-core';

/**
 * Признаки рендера из вызывающего: работа за другого и «только чтение».
 * Смотрит на исходного человека (`person()`), поэтому система от имени
 * заместителя даёт те же признаки. Канал кладёт их в `RenderContext`.
 */
export class RenderFlags {
  private constructor(
    readonly delegate: boolean,
    readonly readOnly: boolean,
  ) {}

  static of<U extends Identified>(caller: Caller<U>): RenderFlags {
    const person = caller.person();
    return person instanceof DelegateCaller
      ? new RenderFlags(true, person.readOnly)
      : new RenderFlags(false, false);
  }
}
