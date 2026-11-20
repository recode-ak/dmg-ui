import { examplePagesRoutes } from 'dmg-ui/web-ui/testing';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import type { ExamplePerson } from '../common/example-people.types';
import { EXAMPLE_PATHS } from '../common/example-web.const';
import { SHELL_HOSTS, SHELL_TEXTS } from './page-shell.const';
import type { PageShellPage, PageShellSpec } from './page-shell.types';

/**
 * HTML страниц примера и заголовки безопасности. Страница без данных запроса:
 * имена людей и пути — константы примера, значения в разметку идут через
 * экранирование. Страница выбора («Кто вы?») клиента не подключает: без
 * годного пропуска приложению подключаться некуда. Политика содержимого — второй
 * рубеж к «строки людей только текстом»: свои скрипты и стили, сокет только
 * на свои адреса.
 */
export class PageShell {
  protected constructor(protected readonly spec: PageShellSpec) {}

  static render(spec: PageShellSpec): PageShellPage {
    return new PageShell(spec).page();
  }

  protected page(): PageShellPage {
    const { person, port } = this.spec;
    return {
      html: person === undefined ? this.choice() : this.app(person),
      headers: this.headers(port),
    };
  }

  protected app(person: ExamplePerson): string {
    const others = EXAMPLE_PEOPLE.filter(({ key }) => key !== person.key);
    const links = examplePagesRoutes
      .filter((route) => route.visible)
      .map(
        (route) =>
          `<a href="${PageShell.esc(route.path)}">${PageShell.esc(route.label)}</a>`,
      )
      .join('');
    const switches = others
      .map(
        (other) =>
          `<form class="example-switch" method="post" action="${this.enter(other)}"><button type="submit">${SHELL_TEXTS.switchTo} ${PageShell.esc(other.name)}</button></form>`,
      )
      .join('');
    const body = [
      '<header class="example-bar">',
      `<span class="example-who">${SHELL_TEXTS.who} <strong>${PageShell.esc(person.name)}</strong></span>`,
      `<nav class="example-nav">${links}</nav>`,
      switches,
      '</header>',
      `<script type="module" src="${EXAMPLE_PATHS.app}"></script>`,
    ].join('\n');
    return this.document(SHELL_TEXTS.title, body);
  }

  protected choice(): string {
    const forms = EXAMPLE_PEOPLE.map(
      (person) =>
        `<form method="post" action="${this.enter(person)}"><button type="submit" class="primary">${PageShell.esc(person.name)}</button></form>`,
    ).join('\n');
    const body = [
      '<main class="example-choice">',
      `<h1>${SHELL_TEXTS.choiceTitle}</h1>`,
      `<p>${SHELL_TEXTS.choiceHint}</p>`,
      forms,
      '</main>',
    ].join('\n');
    return this.document(SHELL_TEXTS.title, body);
  }

  protected document(title: string, body: string): string {
    return [
      '<!doctype html>',
      '<html lang="ru">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${PageShell.esc(title)}</title>`,
      `<link rel="stylesheet" href="${EXAMPLE_PATHS.styles}">`,
      '</head>',
      '<body>',
      body,
      '</body>',
      '</html>',
      '',
    ].join('\n');
  }

  protected headers(port: number): Record<string, string> {
    const sockets = SHELL_HOSTS.map((host) => `ws://${host}:${port}`).join(' ');
    return {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self'",
        `connect-src 'self' ${sockets}`,
        "img-src 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'same-origin',
    };
  }

  /** Адрес входа человека: константа пути и ключ из списка людей. */
  protected enter(person: ExamplePerson): string {
    return PageShell.esc(`${EXAMPLE_PATHS.enter}${person.key}`);
  }

  protected static esc(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
