import { SHARED_FOLDER } from '../src/graph/ui-graph-provider.const';
import { UI_ZONE_WORDS } from './ui-file-names.const';
import type {
  UiFileKind,
  UiFilePath,
  UiPlaceZone,
  UiZoneHit,
} from './ui-file-names.types';
import type { UiNamesZones } from './ui-names-zones';
import type { UiScreenStories } from './ui-screen-stories';

/**
 * Место файла в зоне (`NM-01`, проверка `место`): вид UI — в своей зоне; дерево описания
 * (корень, `<m>/<m>.ui-module.ts`, один уровень папок сторис и `shared/`, экран — у сторис,
 * которые его открывают); код и каналы модуля — зеркало описания с парой по пути; kit —
 * без видов UI; оболочка — только её виды. Место уведомления внутри модуля не проверяется.
 */
export class UiFilePlace {
  constructor(
    private readonly zones: UiNamesZones,
    private readonly paths: ReadonlySet<string>,
    private readonly stories: UiScreenStories,
  ) {}

  /** Что не так с местом файла; `undefined` — на месте или зона места не проверяет. */
  problem(
    file: UiFilePath,
    kind: UiFileKind | undefined,
    hit: UiZoneHit,
  ): string | undefined {
    if (hit.field === 'other' || hit.field === 'tests') return undefined;
    if (kind && kind.zone !== hit.field) {
      return this.foreign(kind, hit.field);
    }
    if (hit.field === 'ui') return this.inUi(file, kind, hit.rest);
    if (hit.field === 'logic' || hit.field === 'channel') {
      return this.inModule(file, kind, hit);
    }
    return undefined;
  }

  private foreign(kind: UiFileKind, zone: UiPlaceZone): string {
    return `место: «.${kind.suffix}» — вид ${UI_ZONE_WORDS[kind.zone].of}, файл лежит ${UI_ZONE_WORDS[zone].at}`;
  }

  /** Дерево описания: `rest` — путь от корня описания. */
  private inUi(
    file: UiFilePath,
    kind: UiFileKind | undefined,
    rest: readonly string[],
  ): string | undefined {
    const [module = '', folder = ''] = rest;
    const suffix = kind?.suffix;
    if (suffix === 'set') {
      return rest.length === 1
        ? undefined
        : `место: «.set» лежит вне корня описания — ожидается ${this.zones.described(file.base)}`;
    }
    if (suffix === 'ui-module') {
      return rest.length === 2 && module === file.name
        ? undefined
        : `место: UI-модуль «${file.name}» лежит не в своей папке — ожидается ${this.zones.described(file.name, file.base)}`;
    }
    if (rest.length === 1) {
      return kind
        ? `место: «.${kind.suffix}» лежит вне папки UI-модуля — ожидается ${this.zones.described('<m>', '<папка сторис>', file.base)}`
        : undefined;
    }
    if (rest.length === 2) {
      return `место: в корне модуля «${module}» — только ${module}.ui-module.ts и папки сторис`;
    }
    if (rest.length > 3) {
      return `место: папка глубже одного уровня — в модуле «${module}» только папки сторис и ${SHARED_FOLDER}/`;
    }
    if (
      !this.paths.has(this.zones.described(module, `${module}.ui-module.ts`))
    ) {
      return `место: в папке «${module}» есть файлы описания, но нет ${module}.ui-module.ts`;
    }
    if (suffix === 'story') return this.story(file, module, folder);
    if (suffix === 'screen') return this.screen(file, module, folder);
    return undefined;
  }

  private story(
    file: UiFilePath,
    module: string,
    folder: string,
  ): string | undefined {
    if (file.name === SHARED_FOLDER) {
      return `место: имя сторис «${SHARED_FOLDER}» занято папкой общих экранов модуля`;
    }
    return folder === file.name
      ? undefined
      : `место: сторис «${file.name}» лежит не в своей папке — ожидается ${this.zones.described(module, file.name, file.base)}`;
  }

  /** Экран одной сторис — в её папке, двух и больше — в `shared/`. */
  private screen(
    file: UiFilePath,
    module: string,
    folder: string,
  ): string | undefined {
    const [single, ...more] = this.stories.of(file.path);
    if (!single) return undefined;
    const home = more.length ? SHARED_FOLDER : single;
    if (folder === home) return undefined;
    const who = more.length
      ? `открывают сторис папок ${[single, ...more].join(', ')} — общий экран`
      : `открывает одна сторис — папка «${single}»`;
    return `место: экран «${file.name}» ${who}, ожидается ${this.zones.described(module, home, file.base)}`;
  }

  /** Код или канал модуля: зеркало описания, `rest` — путь от каталога зоны модуля. */
  private inModule(
    file: UiFilePath,
    kind: UiFileKind | undefined,
    hit: UiZoneHit,
  ): string | undefined {
    const module = hit.module ?? '';
    const manifest = this.zones.described(module, `${module}.ui-module.ts`);
    const words = UI_ZONE_WORDS[hit.field === 'logic' ? 'logic' : 'channel'];
    if (!this.paths.has(manifest)) {
      return `место: модуль «${module}» без описания — нет ${manifest}`;
    }
    if (hit.rest.length > 2) {
      return `место: папка глубже одного уровня — ${words.at} «${module}» только папки сторис и ${SHARED_FOLDER}/`;
    }
    if (!kind) return undefined;
    const [folder = ''] = hit.rest;
    if (!kind.pairs) {
      return hit.rest.length === 1
        ? undefined
        : `место: «.${kind.suffix}» — реестр модуля, ожидается в корне: ${hit.dir}/${file.base}`;
    }
    if (hit.rest.length === 1) {
      return `место: «.${kind.suffix}» лежит в корне ${words.of} «${module}» — ожидается в папке сторис или ${SHARED_FOLDER}/, по пути пары в описании`;
    }
    const pair = this.zones.described(module, folder, `${file.name}.`);
    return kind.pairs.some((suffix) => this.paths.has(`${pair}${suffix}.ts`))
      ? undefined
      : `место: «.${kind.suffix}» без пары в описании — ожидается ${kind.pairs.map((suffix, i) => (i ? `.${suffix}.ts` : `${pair}${suffix}.ts`)).join(' или ')}`;
  }
}
