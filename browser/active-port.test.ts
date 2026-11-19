import { describe, expect, test } from 'bun:test';
import { ActivePort } from './active-port';

// Файл `DevToolsActivePort` Chrome: первая строка — порт, вторая — путь
// WebSocket. Пока Chrome пишет файл, чтение может поймать неполный текст.

describe('ActivePort.parse — файл DevToolsActivePort', () => {
  test('две строки — порт числом и путь', () => {
    expect(ActivePort.parse('41234\n/devtools/browser/abc-123\n')).toEqual({
      port: 41234,
      path: '/devtools/browser/abc-123',
    });
  });

  test('две строки без завершающего перевода строки — тоже разобраны', () => {
    expect(ActivePort.parse('9222\n/devtools/browser/x')).toEqual({
      port: 9222,
      path: '/devtools/browser/x',
    });
  });

  test('пустой текст — undefined', () => {
    expect(ActivePort.parse('')).toBeUndefined();
  });

  test('одна строка (путь ещё не записан) — undefined', () => {
    expect(ActivePort.parse('41234\n')).toBeUndefined();
    expect(ActivePort.parse('41234')).toBeUndefined();
  });

  test('мусор вместо порта — undefined', () => {
    expect(ActivePort.parse('не порт\n/devtools/browser/x\n')).toBeUndefined();
  });

  test('путь не от корня — undefined', () => {
    expect(ActivePort.parse('41234\nbrowser/x\n')).toBeUndefined();
  });
});
