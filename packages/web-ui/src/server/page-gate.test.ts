import { describe, expect, test } from 'bun:test';
import { PageGate } from './page-gate';

// Ворота страничного канала до открытия соединения: источник запроса — по
// белому списку точным совпадением, пропуск — из cookie с одним вхождением
// имени. Синхронно, без лога; значения в отказ не попадают.

const ORIGIN = 'https://school.example';
const COOKIE = 'dmg_page';

const gate = () =>
  new PageGate({ origins: [ORIGIN, 'http://localhost:3000'], cookie: COOKIE });

const admit = (headers: Record<string, string>) =>
  gate().admit(new Headers(headers));

describe('PageGate.admit — пропуск принят', () => {
  test('разрешённый Origin и cookie — ok с токеном', () => {
    expect(admit({ Origin: ORIGIN, Cookie: `${COOKIE}=t1` })).toEqual({
      ok: true,
      value: { token: 't1' },
    });
  });

  test('второй источник списка — тоже принят', () => {
    expect(
      admit({ Origin: 'http://localhost:3000', Cookie: `${COOKIE}=t1` }),
    ).toEqual({ ok: true, value: { token: 't1' } });
  });

  test('cookie среди других — найдена по имени', () => {
    expect(admit({ Origin: ORIGIN, Cookie: `a=1; ${COOKIE}=t1; b=2` })).toEqual(
      { ok: true, value: { token: 't1' } },
    );
  });

  test('значение ровно 256 символов — принято', () => {
    const token = 'x'.repeat(256);

    expect(admit({ Origin: ORIGIN, Cookie: `${COOKIE}=${token}` })).toEqual({
      ok: true,
      value: { token },
    });
  });

  test('заголовки — структурный порт с get: годится не только Headers', () => {
    const values = new Map([
      ['origin', ORIGIN],
      ['cookie', `${COOKIE}=t1`],
    ]);
    const headers = {
      get: (name: string) => values.get(name.toLowerCase()) ?? null,
    };

    expect(gate().admit(headers)).toEqual({
      ok: true,
      value: { token: 't1' },
    });
  });
});

describe('PageGate.admit — источник', () => {
  test.each([
    ['нет Origin', {}],
    ['Origin: null', { Origin: 'null' }],
    ['чужой домен', { Origin: 'https://evil.example' }],
    ['тот же домен с другим портом', { Origin: 'https://school.example:8443' }],
    ['тот же домен с другой схемой', { Origin: 'http://school.example' }],
    ['источник с косой чертой в конце', { Origin: `${ORIGIN}/` }],
    ['поддомен разрешённого', { Origin: 'https://evil.school.example' }],
  ] satisfies [string, Record<string, string>][])(
    '%s при верной cookie — err origin',
    (_name, origin) => {
      expect(admit({ ...origin, Cookie: `${COOKIE}=t1` })).toEqual({
        ok: false,
        error: 'origin',
      });
    },
  );

  test('чужой Origin и нет пропуска — origin, а не token: источник проверяется первым', () => {
    expect(admit({ Origin: 'https://evil.example' })).toEqual({
      ok: false,
      error: 'origin',
    });
  });
});

describe('PageGate.admit — пропуск', () => {
  test.each([
    ['нет заголовка Cookie', undefined],
    ['нет cookie с этим именем', 'a=1; b=2'],
    ['пустое значение', `${COOKIE}=`],
    ['значение длиннее 256 символов', `${COOKIE}=${'x'.repeat(257)}`],
    ['имя дважды', `${COOKIE}=t1; ${COOKIE}=t2`],
    ['имя — часть другого имени', `x${COOKIE}=t1; ${COOKIE}_old=t2`],
  ] satisfies [string, string | undefined][])(
    '%s — err token',
    (_name, cookie) => {
      expect(
        admit(
          cookie === undefined
            ? { Origin: ORIGIN }
            : { Origin: ORIGIN, Cookie: cookie },
        ),
      ).toEqual({ ok: false, error: 'token' });
    },
  );
});

describe('PageGate — сборка', () => {
  test('пустой список источников — бросок в конструкторе', () => {
    expect(() => new PageGate({ origins: [], cookie: COOKIE })).toThrow();
  });

  test.each([
    ['пустая строка', ''],
    ["'null' — Origin песочницы и файла", 'null'],
    ['косая черта в конце', `${ORIGIN}/`],
    ['с путём', `${ORIGIN}/app`],
    ['верхний регистр', 'https://School.Example'],
    ['стандартный порт указан', 'https://school.example:443'],
  ])('источник в списке — %s: бросок в конструкторе', (_name, origin) => {
    expect(
      () => new PageGate({ origins: [ORIGIN, origin], cookie: COOKIE }),
    ).toThrow('не в канонической форме');
  });

  test('схема, хост и нестандартный порт — принят, такой Origin проходит', () => {
    const origin = 'https://school.example:8443';
    const custom = new PageGate({ origins: [origin], cookie: COOKIE });

    expect(
      custom.admit(new Headers({ Origin: origin, Cookie: `${COOKIE}=t1` })),
    ).toEqual({ ok: true, value: { token: 't1' } });
  });
});
