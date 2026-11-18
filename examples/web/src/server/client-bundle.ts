import {
  CLIENT_ENTRY,
  FORBIDDEN_SEGMENTS,
  FORBIDDEN_WORDS,
} from './client-bundle.const';
import type {
  ClientBundleResult,
  ClientBundleSpec,
} from './client-bundle.types';

/**
 * Сборка клиента под браузер и проверка её запретных входов. Проверка — по
 * метафайлу, а не по тексту вывода: `import 'node:fs'` под `target: 'browser'`
 * собирается и заменяется пустым объектом, строки `node:` в выводе нет, он
 * виден только в `imports`; `bun:` роняет сборку. Вход строится один раз при
 * старте сервера, в памяти; пересборки по запросу нет.
 */
export class ClientBundle {
  protected constructor(protected readonly spec: ClientBundleSpec) {}

  /** Собирает клиент (или вход из `spec`); сбой сборки — бросок. */
  static build(
    spec: ClientBundleSpec = { entry: CLIENT_ENTRY },
  ): Promise<ClientBundleResult> {
    return new ClientBundle(spec).run();
  }

  protected async run(): Promise<ClientBundleResult> {
    const { spec } = this;
    const built = await Bun.build({
      entrypoints: [spec.entry],
      target: 'browser',
      metafile: true,
      minify: false,
      ...(spec.files === undefined ? {} : { files: spec.files }),
    });
    const inputs = built.metafile?.inputs ?? {};
    const imports = new Set<string>();
    for (const input of Object.values(inputs)) {
      for (const item of input.imports) imports.add(item.path);
    }
    const [output] = built.outputs;
    return {
      code: output === undefined ? '' : await output.text(),
      inputs: Object.keys(inputs),
      imports: [...imports],
      outputs: built.outputs.length,
    };
  }

  /** Нарушения сборки для браузера: пустой список — чисто. Каждое называет, что нашлось. */
  static violations(
    bundle: Pick<ClientBundleResult, 'inputs' | 'imports' | 'code'>,
  ): string[] {
    const found: string[] = [];
    for (const path of bundle.imports) {
      if (/^(node|bun):/.test(path)) found.push(`импорт «${path}» в сборке`);
    }
    for (const input of bundle.inputs) {
      const segment = FORBIDDEN_SEGMENTS.find((part) => input.includes(part));
      if (segment !== undefined) {
        found.push(`вход «${input}»: каталог «${segment}» не для браузера`);
      }
    }
    for (const word of FORBIDDEN_WORDS) {
      if (word.test(bundle.code))
        found.push(`в выводе слово среды ${word.source}`);
    }
    return found;
  }
}
