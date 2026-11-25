import type { ExampleRegion } from '../common/example-web.types';
import type { DraftKey } from './form-drafts.types';

/** Черновики одной области: экран, которому они принадлежат, и значения по форме и полю. */
type RegionDrafts = {
  screen: string;
  readonly values: Map<string, Map<string, string>>;
};

/**
 * Набранное в полях — память вкладки, не состояние области: ввод переживает
 * пересоздание тела области. Значение модели применяется, пока поле не
 * тронуто. Ввод на другом экране той же области сбрасывает её черновики.
 */
export class FormDrafts {
  private readonly regions = new Map<ExampleRegion, RegionDrafts>();

  /** Запомнить набранное (в том числе пустую строку). */
  track(key: DraftKey, value: string): void {
    let drafts = this.regions.get(key.region);
    if (drafts === undefined || drafts.screen !== key.screen) {
      drafts = { screen: key.screen, values: new Map() };
      this.regions.set(key.region, drafts);
    }
    let fields = drafts.values.get(key.form);
    if (fields === undefined) {
      fields = new Map();
      drafts.values.set(key.form, fields);
    }
    fields.set(key.field, value);
  }

  /** Набранное в поле; не тронуто — значение модели. */
  value(key: DraftKey, fromModel: string): string {
    const drafts = this.regions.get(key.region);
    if (drafts?.screen !== key.screen) return fromModel;
    return drafts.values.get(key.form)?.get(key.field) ?? fromModel;
  }

  /** Забыть черновики формы (после успеха). */
  forgetForm(region: ExampleRegion, screen: string, form: string): void {
    const drafts = this.regions.get(region);
    if (drafts?.screen === screen) drafts.values.delete(form);
  }

  /** Забыть черновики области. */
  forgetRegion(region: ExampleRegion): void {
    this.regions.delete(region);
  }
}
