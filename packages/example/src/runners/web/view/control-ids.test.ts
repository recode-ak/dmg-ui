import { describe, expect, test } from 'bun:test';
import { ControlIds } from './control-ids';

// Идентификаторы «причина» и «подсказка» берутся только из имён Def и
// области: строк людей в них нет. Уникальность между областями — решение, а
// не совпадение: в «Назначенные мне» и в списке одно и то же `completeSelected`.

const REGIONS = ['main', 'side', 'modal'] as const;
/** Допустимый `id` разметки: без пробелов, с буквы. */
const VALID_ID = /^[A-Za-z][A-Za-z0-9-]*$/;

describe('ControlIds.reason', () => {
  test('формат: reason-<область>-<имя>', () => {
    expect(ControlIds.reason('main', 'completeSelected')).toBe(
      'reason-main-completeSelected',
    );
  });

  test('одно имя в main и modal — разные идентификаторы', () => {
    expect(ControlIds.reason('main', 'completeSelected')).not.toBe(
      ControlIds.reason('modal', 'completeSelected'),
    );
  });

  test('одно имя во всех трёх областях — три разных идентификатора', () => {
    const ids = REGIONS.map((region) => ControlIds.reason(region, 'next'));

    expect(new Set(ids).size).toBe(REGIONS.length);
  });

  test('разные имена в одной области — разные идентификаторы', () => {
    expect(ControlIds.reason('main', 'next')).not.toBe(
      ControlIds.reason('main', 'prev'),
    );
  });

  test('идентификатор допустим для разметки: нет пробелов и служебных знаков', () => {
    for (const region of REGIONS) {
      expect(ControlIds.reason(region, 'completeSelected')).toMatch(VALID_ID);
    }
  });
});

describe('ControlIds.help', () => {
  test('формат: help-<область>-<форма>-<поле>', () => {
    expect(ControlIds.help('side', 'remind', 'remindOn')).toBe(
      'help-side-remind-remindOn',
    );
  });

  test('одно поле в разных формах — разные идентификаторы', () => {
    expect(ControlIds.help('main', 'create', 'title')).not.toBe(
      ControlIds.help('main', 'assign', 'title'),
    );
  });

  test('разные поля одной формы — разные идентификаторы', () => {
    expect(ControlIds.help('side', 'remind', 'urgent')).not.toBe(
      ControlIds.help('side', 'remind', 'remindOn'),
    );
  });

  test('одна форма и поле в разных областях — разные идентификаторы', () => {
    const ids = REGIONS.map((region) =>
      ControlIds.help(region, 'jumpTo', 'part'),
    );

    expect(new Set(ids).size).toBe(REGIONS.length);
  });

  test('идентификатор допустим для разметки', () => {
    expect(ControlIds.help('modal', 'remind', 'remindOn')).toMatch(VALID_ID);
  });

  test('«причина» и «подсказка» не совпадают даже для одинаковых имён', () => {
    expect(ControlIds.help('main', 'next', 'next')).not.toBe(
      ControlIds.reason('main', 'next'),
    );
  });
});

describe('ControlIds.sheet', () => {
  test('формат: sheet-<область>', () => {
    expect(ControlIds.sheet('main')).toBe('sheet-main');
  });

  test('три области — три разных идентификатора', () => {
    const ids = REGIONS.map((region) => ControlIds.sheet(region));

    expect(new Set(ids).size).toBe(REGIONS.length);
  });

  test('идентификатор допустим для разметки', () => {
    for (const region of REGIONS) {
      expect(ControlIds.sheet(region)).toMatch(VALID_ID);
    }
  });

  test('не совпадает ни с «причиной», ни с «подсказкой» поля той же области', () => {
    for (const region of REGIONS) {
      expect(ControlIds.sheet(region)).not.toBe(
        ControlIds.reason(region, 'sheet'),
      );
      expect(ControlIds.sheet(region)).not.toBe(
        ControlIds.help(region, 'sheet', 'sheet'),
      );
    }
  });
});
