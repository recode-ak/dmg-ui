import type { InstanceJson } from 'dmg-ui';
import * as v from 'valibot';
import { MAX_PATH, MAX_STEP_LENGTH } from './conversation.const';

/** Адрес элемента пути — ровно то, что нужно правилу обрезки: id экрана. */
const StepScreen = v.object({ address: v.object({ screen: v.string() }) });

/**
 * Путь переходов беседы (D-UI-53): снимки экземпляров ядра экранов, с которых
 * ушли переходом на другой экран, старые первыми, не больше `MAX_PATH`. В пути
 * нет двух элементов одного экрана и нет живого экрана — циклов нет. Элементы
 * из снимка беседы не проверяются: их проверяет ядро при `restore`.
 */
export class ConversationPath {
  private steps: unknown[];

  /** `steps` — из снимка беседы, старые первыми. */
  constructor(steps: readonly unknown[] = []) {
    this.steps = steps.slice(-MAX_PATH);
  }

  /**
   * Уход с живого экрана на экран `target` (id). Тот же экран — путь прежний
   * (листание не растит путь); экран из пути — путь обрезан до него, цель
   * открывается заново; иначе уходящий экран — наверх, сверх предела давний
   * забыт. JSON уходящего длиннее `MAX_STEP_LENGTH` — путь прежний: снимок не растёт.
   */
  leave(left: InstanceJson, target: string): void {
    if (left.address.screen === target) return;
    if (this.cut(target)) return;
    if (JSON.stringify(left).length > MAX_STEP_LENGTH) return;
    this.steps.push(left);
    if (this.steps.length > MAX_PATH) this.steps.shift();
  }

  /**
   * Экран `target` (id) есть в пути — путь обрезан до него, сам он снят:
   * экран открывается заново; true. Экрана в пути нет — путь прежний, false.
   */
  cut(target: string): boolean {
    const at = this.steps.findIndex(
      (step) => ConversationPath.screenOf(step) === target,
    );
    if (at < 0) return false;
    this.steps = this.steps.slice(0, at);
    return true;
  }

  /** Верхний элемент пути без снятия; путь пуст — `undefined`. */
  top(): unknown {
    return this.steps.at(-1);
  }

  /** Верхний элемент пути снят. */
  pop(): void {
    this.steps.pop();
  }

  /** Вход приложения, «В начало», выход сторис с целью home, экран не восстановлен. */
  reset(): void {
    this.steps = [];
  }

  empty(): boolean {
    return this.steps.length === 0;
  }

  /** Для снимка: старые первыми, не больше `MAX_PATH`. */
  toJSON(): readonly unknown[] {
    return [...this.steps];
  }

  /** Id экрана элемента; элемент не той формы (снимок) — нет: обрезке он не мешает. */
  private static screenOf(step: unknown): string | undefined {
    return v.is(StepScreen, step) ? step.address.screen : undefined;
  }
}
