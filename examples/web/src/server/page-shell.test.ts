import { describe, expect, test } from 'bun:test';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { EXAMPLE_COOKIE } from '../common/example-web.const';
import { PageShell } from './page-shell';

// HTML страниц примера и заголовки безопасности. Страница без данных
// запроса: имена людей — константы примера, значения в разметку идут через
// экранирование. Страница выбора («Кто вы?») клиента не подключает: без
// годного пропуска приложению подключаться некуда.

const PORT = 51234;

const person = (key: string) => {
  const found = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`нет человека ${key}`);
  return found;
};

const app = (key = 'anna') =>
  PageShell.render({ person: person(key), port: PORT });
const choice = () => PageShell.render({ person: undefined, port: PORT });

/** Заголовок без учёта регистра имени. */
const header = (headers: Record<string, string>, name: string) =>
  Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];

/** Директивы политики содержимого: имя → источники. */
const policy = (headers: Record<string, string>) => {
  const text = header(headers, 'Content-Security-Policy') ?? '';
  return new Map(
    text
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map((part) => {
        const [name = '', ...sources] = part.split(/\s+/);
        return [name, sources] as const;
      }),
  );
};

describe('PageShell — страница приложения', () => {
  test('язык — русский; клиент подключён модулем /_app.js', () => {
    const { html } = app();

    expect(html).toContain('lang="ru"');
    const tag = html.match(/<script\b[^>]*\bsrc="\/_app\.js"[^>]*>/)?.[0];
    expect(tag).toBeDefined();
    expect(tag).toContain('type="module"');
  });

  test('вверху — «Вы: <имя>» и форма «Войти как <другой>» на POST /_enter/<ключ>', () => {
    const { html } = app('anna');

    expect(html).toMatch(/Вы:\s*(<[^>]+>\s*)*Анна/);
    expect(html).toContain('Войти как Борис');
    expect(html).toMatch(/<form\b[^>]*\baction="\/_enter\/boris"/);
    expect(html).toMatch(/<form\b[^>]*\bmethod="post"/i);
  });

  test('у Бориса — «Войти как Анна» на /_enter/anna', () => {
    const { html } = app('boris');

    expect(html).toMatch(/Вы:\s*(<[^>]+>\s*)*Борис/);
    expect(html).toContain('Войти как Анна');
    expect(html).toMatch(/<form\b[^>]*\baction="\/_enter\/anna"/);
  });

  test('навигация — ссылки на / и /assigned', () => {
    const { html } = app();

    expect(html).toMatch(/<a\b[^>]*\bhref="\/"/);
    expect(html).toMatch(/<a\b[^>]*\bhref="\/assigned"/);
    expect(html).toContain('Мои задачи');
    expect(html).toContain('Назначенные мне');
  });

  test('в разметке нет имени cookie: данных запроса страница не несёт', () => {
    expect(app().html).not.toContain(EXAMPLE_COOKIE);
    expect(choice().html).not.toContain(EXAMPLE_COOKIE);
  });

  test('значение в разметку подставляется экранированным', () => {
    const odd = { ...person('anna'), name: '<i>Анна</i> & co' };

    const { html } = PageShell.render({ person: odd, port: PORT });

    expect(html).toContain('&lt;i&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<i>Анна</i>');
  });
});

describe('PageShell — страница выбора', () => {
  test('«Кто вы?», две формы на POST /_enter/anna и /_enter/boris, кнопки с именами', () => {
    const { html } = choice();

    expect(html).toContain('Кто вы?');
    expect(html).toMatch(/<form\b[^>]*\baction="\/_enter\/anna"/);
    expect(html).toMatch(/<form\b[^>]*\baction="\/_enter\/boris"/);
    expect(html).toContain('Анна');
    expect(html).toContain('Борис');
    expect(html.match(/<form\b/g)).toHaveLength(2);
  });

  test('клиент не подключён: /_app.js нет', () => {
    expect(choice().html).not.toContain('/_app.js');
  });
});

describe('PageShell — заголовки', () => {
  for (const [name, page] of [
    ['приложение', app],
    ['страница выбора', choice],
  ] as const) {
    test(`${name}: политика содержимого закрывает всё, кроме своего источника и сокета`, () => {
      const directives = policy(page().headers);

      expect(directives.get('default-src')).toEqual(["'none'"]);
      expect(directives.get('script-src')).toEqual(["'self'"]);
      expect(directives.get('style-src')).toEqual(["'self'"]);
      expect(directives.get('img-src')).toEqual(["'self'"]);
      expect(directives.get('form-action')).toEqual(["'self'"]);
      expect(directives.get('base-uri')).toEqual(["'none'"]);
      expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    });

    test(`${name}: connect-src называет сокет обоих хостов с портом`, () => {
      const sources = policy(page().headers).get('connect-src') ?? [];

      expect(sources).toContain("'self'");
      expect(sources).toContain(`ws://localhost:${PORT}`);
      expect(sources).toContain(`ws://127.0.0.1:${PORT}`);
    });

    test(`${name}: без unsafe-inline, unsafe-eval и подстановочного источника`, () => {
      const text = header(page().headers, 'Content-Security-Policy') ?? '';

      expect(text).not.toContain('unsafe-');
      expect(text).not.toMatch(/(^|\s)\*(\s|;|$)/);
    });

    test(`${name}: nosniff, no-store, same-origin`, () => {
      const { headers } = page();

      expect(header(headers, 'X-Content-Type-Options')).toBe('nosniff');
      expect(header(headers, 'Cache-Control')).toBe('no-store');
      expect(header(headers, 'Referrer-Policy')).toBe('same-origin');
    });

    test(`${name}: политика ссылающегося не no-referrer`, () => {
      // При `no-referrer` браузер шлёт на POST формы `Origin: null`, ворота
      // отвечают 403, и «Войти как …» не пускает никого.
      expect(header(page().headers, 'Referrer-Policy')).not.toBe('no-referrer');
    });
  }

  test('порт в connect-src — тот, что передан', () => {
    const other = PageShell.render({ person: undefined, port: 4310 });

    const sources = policy(other.headers).get('connect-src') ?? [];
    expect(sources).toContain('ws://localhost:4310');
    expect(sources).not.toContain(`ws://localhost:${PORT}`);
  });
});
