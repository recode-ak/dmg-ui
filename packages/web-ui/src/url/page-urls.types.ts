import type { Address, AnyUiAppDef } from 'dmg-ui';
import type { PageParams } from './page-params';
import type { PagePath } from './page-path';

/**
 * Маршрут — структурно: шаблон пути (`/`, `/assigned`, `/task/:taskId`) и
 * имя входа приложения UI, который он открывает.
 */
export type PageRoute = {
  readonly path: string;
  readonly entry: string;
};

/** Сборка кодека: приложение страниц и его маршруты в порядке объявления. */
export type PageUrlsSpec = {
  readonly app: AnyUiAppDef;
  readonly routes: readonly PageRoute[];
};

/**
 * Причина отказа разбора URL: длиннее предела, не по форме (знаки,
 * декодирование, пустые сегменты, повтор ключа), путь не ведёт к экрану,
 * параметры не прошли перевод или схему экрана.
 */
export type PageUrlRejection =
  | 'tooLong'
  | 'malformed'
  | 'unknownPath'
  | 'invalidParams';

/** Вид параметра экрана в URL — по JSON Schema параметров. */
export type PageParamKind = 'string' | 'integer' | 'boolean';

/** Часть шаблона пути: неизменяемый сегмент или параметр экрана входа. */
export type PagePathPart =
  | { readonly kind: 'fixed'; readonly text: string }
  | { readonly kind: 'param'; readonly name: string };

/** Экран набора для кодека: `id`, общий путь и вид параметров. */
export type PageUrlScreen = {
  readonly id: string;
  readonly path: string;
  readonly params: PageParams;
};

/** Собранный маршрут: шаблон, адрес входа и экран входа. */
export type PageUrlRoute = {
  readonly path: PagePath;
  readonly entry: Address;
  readonly screen: PageUrlScreen;
};
