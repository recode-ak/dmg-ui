import type { ScreenInstance } from 'dmg-ui';
import { PAGE_NOTES } from './page-client.const';
import type {
  PageRegionName,
  PageRegionView,
  PageSlotJson,
  PageSnapshot,
  PendingConfirm,
  RegionMarks,
  RegionSlot,
} from './page-client.types';
import type { PageRenderer } from './page-renderer';

const REGIONS: readonly PageRegionName[] = ['main', 'side'];

/**
 * Две области страницы — `main` и `side` — и политика переходов:
 * `moved` на тот же Def — на месте, на другой — в соседнюю область. В
 * области — один живой экземпляр: новый закрывает прежний (его подписка
 * снимается). Текст области перерисовывается по `onChange` экземпляра и
 * по каждой смене отметок — как страница перерисовывает свою часть.
 */
export class PageRegions {
  private readonly slots: Readonly<Record<PageRegionName, RegionSlot>> = {
    main: PageRegions.empty(),
    side: PageRegions.empty(),
  };

  constructor(private readonly renderer: PageRenderer) {}

  instance(name: PageRegionName): ScreenInstance | undefined {
    return this.slot(name).instance;
  }

  /** Ожидающее подтверждение области. */
  pending(name: PageRegionName): PendingConfirm | undefined {
    return this.slot(name).marks.confirm;
  }

  /** Куда ведёт исход `moved` на экран `screen` из области. */
  target(from: PageRegionName, screen: string): PageRegionName {
    const current = this.slot(from).instance?.view().screen;
    if (current === screen) return from;
    return from === 'main' ? 'side' : 'main';
  }

  /** Экземпляр в область: прежний закрыт, отметки — новые. */
  place(
    name: PageRegionName,
    instance: ScreenInstance,
    marks: RegionMarks = {},
  ): void {
    const slot = this.slot(name);
    this.release(slot);
    slot.instance = instance;
    slot.unlisten = instance.onChange(() => this.render(name));
    slot.marks = marks;
    this.render(name);
  }

  /** Область пуста: экземпляр закрыт, остаются только отметки. */
  clear(name: PageRegionName, marks: RegionMarks = {}): void {
    const slot = this.slot(name);
    this.release(slot);
    slot.marks = marks;
    this.render(name);
  }

  /** Отметки области после сигнала — заменяют прежние целиком. */
  mark(name: PageRegionName, marks: RegionMarks): void {
    this.slot(name).marks = marks;
    this.render(name);
  }

  view(name: PageRegionName): PageRegionView {
    const { instance, marks, text } = this.slot(name);
    const confirm =
      marks.confirm === undefined
        ? {}
        : {
            confirm: {
              action: marks.confirm.action,
              label: marks.confirm.label,
              description: marks.confirm.description,
            },
          };
    return {
      ...(instance === undefined ? {} : { view: instance.view() }),
      ...(marks.note === undefined ? {} : { note: marks.note }),
      issues: marks.issues ?? [],
      ...confirm,
      text,
    };
  }

  /** Текст обеих областей; пустые опускаются. */
  text(): string {
    return REGIONS.map((name) => this.slot(name).text)
      .filter((text) => text !== '')
      .join('\n\n---\n\n');
  }

  /** Снимок областей с экземпляром — в форме JSON (без `state: undefined`). */
  snapshot(): PageSnapshot {
    const slots: Partial<Record<PageRegionName, PageSlotJson>> = {};
    for (const name of REGIONS) {
      const instance = this.slot(name).instance;
      if (instance === undefined) continue;
      const { address, revision, state } = instance.snapshot();
      slots[name] = {
        address,
        revision,
        ...(state === undefined ? {} : { state }),
      };
    }
    return slots;
  }

  private release(slot: RegionSlot): void {
    slot.unlisten?.();
    slot.instance?.close();
    slot.instance = undefined;
    slot.unlisten = undefined;
  }

  /** Перерисовка области: заметка, вид, замечания формы, подтверждение. */
  private render(name: PageRegionName): void {
    const slot = this.slot(name);
    const { note, issues = [], confirm } = slot.marks;
    slot.text = [
      note,
      slot.instance === undefined
        ? undefined
        : this.renderer.screen(slot.instance.view()),
      ...issues.map((issue) =>
        issue.field === undefined
          ? `! ${issue.text}`
          : `! ${issue.field}: ${issue.text}`,
      ),
      confirm === undefined
        ? undefined
        : `${confirm.label}\n${confirm.description}\n  [${PAGE_NOTES.confirm}]`,
    ]
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n');
  }

  private slot(name: PageRegionName): RegionSlot {
    return this.slots[name];
  }

  private static empty(): RegionSlot {
    return { instance: undefined, unlisten: undefined, marks: {}, text: '' };
  }
}
