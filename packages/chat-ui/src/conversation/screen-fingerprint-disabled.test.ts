import { describe, expect, test } from 'bun:test';
import { TextBuilder } from '../message/text-builder';
import type { ViewMessage, ViewOption } from '../view/view.types';
import { ScreenFingerprint } from './screen-fingerprint';

// Отключённые варианты в отпечаток показанного вида не входят: отпечаток
// сверяется при восстановлении беседы, а отключённые ссылки ревизии не несут.
// Прежние отпечатки сохранённых бесед от этого не меняются.

const SAVE: ViewOption = { kind: 'action', name: 'save', label: 'Сохранить' };
const TICK: ViewOption = { kind: 'local', name: 'tick', label: 'Отметить' };
const BACK: ViewOption = { kind: 'back', label: 'Назад' };
const ARCHIVE: ViewOption = {
  kind: 'disabled',
  name: 'archive',
  label: '🚫 В архив',
};
const FOLD: ViewOption = {
  kind: 'disabled',
  name: 'fold',
  label: '🚫 Свернуть',
};

const shown = (...options: readonly ViewOption[]): readonly ViewMessage[] => [
  { kind: 'text', text: TextBuilder.of('Панель'), options },
];

describe('ScreenFingerprint — отключённые варианты', () => {
  test('вид с отключёнными — тот же отпечаток, что у тех же сообщений без них', async () => {
    const without = await ScreenFingerprint.of(shown(SAVE, TICK, BACK));

    expect(
      await ScreenFingerprint.of(shown(SAVE, TICK, ARCHIVE, FOLD, BACK)),
    ).toBe(without);
    expect(
      await ScreenFingerprint.of(shown(SAVE, ARCHIVE, TICK, BACK, FOLD)),
    ).toBe(without);
  });

  test('имя, подпись и число отключённых отпечаток не меняют', async () => {
    const print = await ScreenFingerprint.of(shown(SAVE, ARCHIVE, BACK));

    expect(
      await ScreenFingerprint.of(
        shown(
          SAVE,
          { kind: 'disabled', name: 'other', label: '⛔ Иное' },
          BACK,
        ),
      ),
    ).toBe(print);
    expect(await ScreenFingerprint.of(shown(SAVE, BACK))).toBe(print);
  });

  test('доступное действие стало отключённым — отпечаток меняется', async () => {
    const available = await ScreenFingerprint.of(shown(SAVE, TICK, BACK));
    const disabled = await ScreenFingerprint.of(
      shown(
        SAVE,
        { kind: 'disabled', name: 'tick', label: '🚫 Отметить' },
        BACK,
      ),
    );

    expect(disabled).not.toBe(available);
  });

  test('отключённое стало доступным — отпечаток меняется', async () => {
    const before = await ScreenFingerprint.of(shown(SAVE, ARCHIVE, BACK));
    const after = await ScreenFingerprint.of(
      shown(SAVE, { kind: 'action', name: 'archive', label: 'В архив' }, BACK),
    );

    expect(after).not.toBe(before);
  });
});
