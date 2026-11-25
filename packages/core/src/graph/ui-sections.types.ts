/** Сторис в счёте разделов: `id`, `id` её модуля и `id` сторис из её связей. */
export type SectionStory = {
  readonly id: string;
  readonly module: string;
  readonly leads: readonly string[];
};

/** Связь в счёте: модуль сторис начала и `id` сторис конца. */
export type SectionLink = {
  readonly from: string;
  readonly to: string;
};
