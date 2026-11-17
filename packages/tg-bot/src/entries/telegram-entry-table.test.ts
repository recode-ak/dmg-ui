import { describe, expect, test } from 'bun:test';
import { TelegramEntryTable } from './telegram-entry-table';

// Таблица точек входа Telegram: по имени команды и по параметру
// ссылки отдаёт имя входа приложения. Команда и меню — одно пространство
// (в приёме это одно сообщение `/key`), ссылка — своё. Повтор пары — первая
// запись выигрывает, точка с неизвестным способом пропускается. Регистр и
// формат ключа таблица не трактует: имя команды приводит к нижнему регистру
// приём апдейтов, формат правит TG-02.

const point = (entry: string, via: string, key: string) => ({
  entry,
  via,
  key,
});

describe('TelegramEntryTable — команда', () => {
  const table = new TelegramEntryTable([
    point('start', 'command', 'tasks'),
    point('assigned', 'menu', 'mine'),
    point('assigned', 'link', 'abc'),
  ]);

  test('точка command → вход точки, не по имени входа', () => {
    expect(table.command('tasks')).toBe('start');
  });

  test('точка menu — то же пространство: команда выбирается из меню', () => {
    expect(table.command('mine')).toBe('assigned');
  });

  test('имени нет в таблице — undefined', () => {
    expect(table.command('nope')).toBeUndefined();
    expect(table.command('start')).toBeUndefined();
  });

  test('ключ точки link командой не находится', () => {
    expect(table.command('abc')).toBeUndefined();
  });

  test('имя входа без точки командой не находится', () => {
    expect(table.command('assigned')).toBeUndefined();
  });
});

describe('TelegramEntryTable — ссылка', () => {
  const table = new TelegramEntryTable([
    point('start', 'command', 'start'),
    point('assigned', 'link', 'abc'),
    point('start', 'link', 'Abc'),
  ]);

  test('точка link → вход точки по параметру', () => {
    expect(table.link('abc')).toBe('assigned');
  });

  test('параметр — как есть: Abc ≠ abc', () => {
    expect(table.link('Abc')).toBe('start');
    expect(table.link('ABC')).toBeUndefined();
  });

  test('параметра нет в таблице — undefined', () => {
    expect(table.link('zzz')).toBeUndefined();
  });

  test('ключ точки command ссылкой не находится', () => {
    expect(table.link('start')).toBeUndefined();
  });
});

describe('TelegramEntryTable — повтор и чужие способы', () => {
  test('повтор команды — первая запись выигрывает, в том числе command против menu', () => {
    const table = new TelegramEntryTable([
      point('start', 'menu', 'tasks'),
      point('assigned', 'command', 'tasks'),
      point('assigned', 'command', 'both'),
      point('start', 'command', 'both'),
    ]);

    expect(table.command('tasks')).toBe('start');
    expect(table.command('both')).toBe('assigned');
  });

  test('повтор параметра ссылки — первая запись выигрывает', () => {
    const table = new TelegramEntryTable([
      point('start', 'link', 'abc'),
      point('assigned', 'link', 'abc'),
    ]);

    expect(table.link('abc')).toBe('start');
  });

  test('точка с неизвестным способом пропускается: следующая с тем же ключом находится', () => {
    const table = new TelegramEntryTable([
      point('start', 'message', 'tasks'),
      point('assigned', 'command', 'tasks'),
    ]);

    expect(table.command('tasks')).toBe('assigned');
    expect(table.link('tasks')).toBeUndefined();
  });

  test('точка с неизвестным способом одна — ключ не находится ни командой, ни ссылкой', () => {
    const table = new TelegramEntryTable([point('start', 'message', 'x')]);

    expect(table.command('x')).toBeUndefined();
    expect(table.link('x')).toBeUndefined();
  });

  test('пустая таблица — ничего не находит', () => {
    const table = new TelegramEntryTable([]);

    expect(table.command('start')).toBeUndefined();
    expect(table.link('abc')).toBeUndefined();
  });

  test('ключи объектного прототипа не находятся (__proto__, constructor, toString)', () => {
    const table = new TelegramEntryTable([point('start', 'command', 'start')]);

    for (const key of [
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(table.command(key)).toBeUndefined();
      expect(table.link(key)).toBeUndefined();
    }
  });
});
