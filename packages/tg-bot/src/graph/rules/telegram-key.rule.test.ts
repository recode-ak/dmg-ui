import { describe, expect, test } from 'bun:test';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import { telegramScene } from '../../../testing/telegram-graph-scene';

// TG-02: ключ точки — по правилам Bot API. У `command` и `menu` — имя
// команды `[a-z0-9_]{1,32}`, у `link` — параметр глубокой ссылки
// `[A-Za-z0-9_-]{1,64}`. Формат в тексте — тот же, что у приёма апдейтов.

const COMMAND_FORMAT = '[a-z0-9_]{1,32}';
const LINK_FORMAT = '[A-Za-z0-9_-]{1,64}';

/** Точки без нарушений: `/start` и ссылка на вход `assigned`. */
const BASE = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'assigned', via: 'link', key: 'assigned' },
];

/** Отчёт сцены с одной лишней точкой на входе `start` (её узел — `point-start-2`). */
const withPoint = (via: string, key: string) =>
  ArchReport.of(
    telegramScene({
      entryPoints: [
        ...BASE.slice(0, 1),
        { entry: 'start', via, key },
        ...BASE.slice(1),
      ],
    }),
  );

describe('TG-02: ключ точки по правилам Bot API', () => {
  test.each([
    ['command', 'Tasks', 'заглавная буква'],
    ['command', 'a'.repeat(33), '33 знака'],
    ['command', 'my-cmd', 'дефис'],
    ['command', '', 'пустой ключ'],
    ['menu', 'Tasks', 'заглавная буква в меню'],
    ['menu', 'a'.repeat(33), '33 знака в меню'],
  ])('%s «%s» (%s) — строка TG-02 с форматом команды', (via, key) => {
    const report = withPoint(via, key);

    expect(report.code).toBe(1);
    expect(report.rule('TG-02')).toEqual([
      `TG-02: точка exampleDialog/point-start-2: ключ «${key}» не по правилам Bot API (${COMMAND_FORMAT})`,
    ]);
  });

  test.each([
    ['a'.repeat(65), '65 знаков'],
    ['a.b', 'точка в параметре'],
    ['', 'пустой параметр'],
    ['хлеб', 'кириллица'],
  ])('link «%s» (%s) — строка TG-02 с форматом ссылки', (key) => {
    const report = withPoint('link', key);

    expect(report.rule('TG-02')).toEqual([
      `TG-02: точка exampleDialog/point-start-2: ключ «${key}» не по правилам Bot API (${LINK_FORMAT})`,
    ]);
  });

  test('параметр ссылки a-B_9… из 64 знаков — TG-02 молчит', () => {
    const key = `${'a-B_9'.repeat(12)}a-B_`;

    expect(key).toHaveLength(64);
    expect(withPoint('link', key).rule('TG-02')).toEqual([]);
  });

  test('заглавные буквы допустимы в ссылке, в команде — нет; граничные 32 и 1 знак команды — молчит', () => {
    expect(withPoint('link', 'AbC').rule('TG-02')).toEqual([]);
    expect(withPoint('command', 'a'.repeat(32)).rule('TG-02')).toEqual([]);
    expect(withPoint('command', 'a').rule('TG-02')).toEqual([]);
    expect(withPoint('menu', '_9').rule('TG-02')).toEqual([]);
  });

  test('точка с неизвестным способом ключ не проверяет — это TG-01', () => {
    expect(withPoint('message', 'Не По Правилам').rule('TG-02')).toEqual([]);
  });
});
