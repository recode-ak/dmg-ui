import { UiDeclarations } from './ui-declarations';
import type { UiNamesSource } from './ui-file-names.types';
import type { UiNamesZones } from './ui-names-zones';

/**
 * Какие сторис модуля открывают экран: по относительным импортам `.story` описания из
 * переданных текстов, без диска. Экран, импортированный через `index` модуля, псевдоним
 * пути или реэкспорт, не выводится — его место не проверяется.
 */
export class UiScreenStories {
  /** Путь экрана → папки сторис того же модуля, которые его импортируют. */
  private readonly folders = new Map<string, Set<string>>();

  constructor(files: readonly UiNamesSource[], zones: UiNamesZones) {
    for (const file of files) {
      if (!file.path.endsWith('.story.ts')) continue;
      const story = zones.find(file.path);
      if (story?.field !== 'ui' || story.rest.length !== 3) continue;
      const [module, folder] = story.rest;
      const dir = file.path.slice(0, file.path.lastIndexOf('/'));
      for (const spec of new UiDeclarations(file.text).imports()) {
        const target = `${this.resolve(dir, spec).replace(/\.ts$/, '')}.ts`;
        if (!target.endsWith('.screen.ts')) continue;
        const screen = zones.find(target);
        if (screen?.field !== 'ui' || screen.rest[0] !== module) continue;
        this.add(target, folder ?? '');
      }
    }
  }

  /** Папки сторис, открывающих экран, по алфавиту; пусто — место экрана не выведено. */
  of(path: string): string[] {
    return [...(this.folders.get(path) ?? [])].sort();
  }

  private add(screen: string, folder: string): void {
    const folders = this.folders.get(screen) ?? new Set<string>();
    folders.add(folder);
    this.folders.set(screen, folders);
  }

  /** Относительный спецификатор от каталога файла: `.` и `..` снимаются. */
  private resolve(dir: string, spec: string): string {
    const parts = dir.split('/');
    for (const part of spec.split('/')) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    return parts.join('/');
  }
}
