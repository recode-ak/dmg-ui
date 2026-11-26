/**
 * Перенос строк созданного кода по ширине biome (`lineWidth` 80 по
 * умолчанию): что помещается — одной строкой (biome склеил бы перенос
 * обратно), иначе — в форме biome.
 */
export class LineWidth {
  private static readonly MAX = 80;

  /** Импорт одного имени — всегда одной строкой: biome не переносит одно имя */
  importOf(name: string, from: string): string {
    return this.named('import {', name, from);
  }

  /** Реэкспорт одного имени — всегда одной строкой, как импорт */
  exportOf(name: string, from: string): string {
    return this.named('export {', name, from);
  }

  /**
   * Реестр `declaration [arrow] call(def, [ marker ]);`. Тело стрелки biome
   * переносит всегда; не помещается `declaration arrow` или
   * `declaration call(` — перенос после `=`; не помещается `call(def, [` —
   * аргументы по строкам.
   */
  registry(
    declaration: string,
    call: string,
    def: string,
    marker: string,
    arrow?: string,
  ): string {
    const body = (indent: number, prefix = '') =>
      this.call(indent, prefix, call, def, marker);
    let lines: string[];
    if (arrow !== undefined) {
      const head = `${declaration} ${arrow}`;
      lines = this.fits(head)
        ? [head, ...body(2)]
        : [declaration, `  ${arrow}`, ...body(4)];
    } else {
      lines = this.fits(`${declaration} ${call}(`)
        ? body(0, `${declaration} `)
        : [declaration, ...body(2)];
    }
    return `${lines.join('\n')};\n`;
  }

  /**
   * Определение `declaration call({ body });`; body — строки объекта без
   * отступа. Не помещается `declaration call(` — перенос после `=`, не
   * помещается `({` — объект аргументом на своих строках.
   */
  define(declaration: string, call: string, body: string[]): string {
    const indent = (pad: string) => body.map((row) => `${pad}${row}`);
    const open = `${declaration} ${call}(`;
    let lines: string[];
    if (!this.fits(open)) {
      lines = [declaration, `  ${call}({`, ...indent('    '), '  });'];
    } else if (this.fits(`${open}{`)) {
      lines = [`${open}{`, ...indent('  '), '});'];
    } else {
      lines = [open, '  {', ...indent('    '), '  },', ');'];
    }
    return `${lines.join('\n')}\n`;
  }

  /** Вызов `call(def, [ marker ])` с отступом: массив прижат к строке вызова или аргументы по строкам */
  private call(
    indent: number,
    prefix: string,
    call: string,
    def: string,
    marker: string,
  ): string[] {
    const pad = ' '.repeat(indent);
    const hug = `${pad}${prefix}${call}(${def}, [`;
    if (this.fits(hug)) return [hug, `${pad}  ${marker}`, `${pad}])`];
    return [
      `${pad}${prefix}${call}(`,
      `${pad}  ${def},`,
      `${pad}  [`,
      `${pad}    ${marker}`,
      `${pad}  ],`,
      `${pad})`,
    ];
  }

  private named(open: string, name: string, from: string): string {
    return `${open} ${name} } from '${from}';`;
  }

  private fits(line: string): boolean {
    return line.length <= LineWidth.MAX;
  }
}
