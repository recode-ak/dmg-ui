import type {
  UiNamesLayout,
  UiNamesZone,
  UiZoneField,
  UiZoneHit,
} from './ui-file-names.types';

/**
 * Зоны конфигурации `NM-01`: к какой зоне относится путь файла, какие зоны пусты, где
 * проверяется тест рядом и где в описании лежит пара. Шаблон `{m}` — один сегмент пути,
 * имя UI-модуля. Пересекающиеся зоны разбираются по порядку: описание, kit, оболочки,
 * код модуля, каналы модуля, прочее.
 */
export class UiNamesZones {
  private readonly zones: readonly UiNamesZone[];
  private readonly ui: string;

  constructor(layout: UiNamesLayout) {
    this.ui = this.trim(layout.ui);
    this.zones = [
      this.zone('ui', layout.ui),
      ...(layout.kits ?? []).map((dir) => this.zone('kit', dir)),
      ...(layout.shells ?? []).map((dir) => this.zone('shell', dir)),
      this.zone('logic', layout.logic),
      ...layout.channels.map((template) => this.zone('channel', template)),
      ...(layout.others ?? []).map((dir) => this.zone('other', dir)),
      ...(layout.tests ?? []).map((dir) => this.zone('tests', dir)),
    ];
  }

  /** Зона кода с путём внутри; `tests` в разбор не входит — там проверяется только тест рядом. */
  find(path: string): UiZoneHit | undefined {
    for (const zone of this.zones) {
      if (zone.field === 'tests') continue;
      const hit = this.match(zone, path);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Тест рядом проверяется во всех зонах, кроме `others`. */
  checksTest(path: string): boolean {
    return this.zones.some(
      (zone) => zone.field !== 'other' && zone.pattern.test(path),
    );
  }

  /** Шаблоны и каталоги зон, под которыми нет ни одного файла, — по одному разу. */
  empty(paths: readonly string[]): string[] {
    const templates = new Set<string>();
    for (const zone of this.zones) {
      if (!paths.some((path) => zone.pattern.test(path))) {
        templates.add(zone.template);
      }
    }
    return [...templates];
  }

  /** Путь в описании модуля: `<ui>/<m>/<части>`. */
  described(module: string, ...parts: string[]): string {
    return [this.ui, module, ...parts].join('/');
  }

  private zone(field: UiZoneField, template: string): UiNamesZone {
    const trimmed = this.trim(template);
    const templated = field === 'logic' || field === 'channel';
    const parts = trimmed.split('{m}');
    if (parts.length !== (templated ? 2 : 1)) {
      throw new Error(
        `UiNamesLayout: «${template}» — ${templated ? 'в шаблоне logic и channels нужен ровно один {m}' : '{m} допустим только в logic и channels'}`,
      );
    }
    const source = parts.map((part) => this.escape(part)).join('([^/]+)');
    return {
      field,
      template: trimmed,
      pattern: new RegExp(`^${source}/(.+)$`),
    };
  }

  private match(zone: UiNamesZone, path: string): UiZoneHit | undefined {
    const found = zone.pattern.exec(path);
    if (!found) return undefined;
    const templated = found.length === 3;
    const module = templated ? found[1] : undefined;
    const rest = (templated ? found[2] : found[1]) ?? '';
    return {
      field: zone.field,
      dir: module ? zone.template.replace('{m}', module) : zone.template,
      module,
      rest: rest.split('/'),
    };
  }

  private trim(dir: string): string {
    return dir.replace(/\/+$/, '');
  }

  private escape(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
