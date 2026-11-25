/** Сторис в счёте разделов: `id`, `id` её модуля и `id` сторис из её связей. */
export type SectionStory = {
  readonly id: string;
  readonly module: string;
  readonly leads: readonly string[];
};
