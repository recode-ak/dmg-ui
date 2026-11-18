import type { ExamplePerson } from '../common/example-people.types';

/** Что рисует оболочка: человек (нет — страница выбора) и порт сервера для политики содержимого. */
export type PageShellSpec = {
  readonly person: ExamplePerson | undefined;
  readonly port: number;
};

/** Готовая страница: разметка и заголовки ответа. */
export type PageShellPage = {
  readonly html: string;
  readonly headers: Record<string, string>;
};
