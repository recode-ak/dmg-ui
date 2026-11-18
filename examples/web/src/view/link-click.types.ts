/** Факты щелчка по ссылке: то, что решает, кому достанется переход. */
export type LinkFacts = {
  readonly href: string | undefined;
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
  readonly target: string | undefined;
  readonly download: boolean;
};
