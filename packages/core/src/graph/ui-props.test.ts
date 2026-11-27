import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { UI_PROPS } from './ui-props';

// Схема `props` узла `story`: обязательный `startsFrom` и строгие записи входов.

const story = {
  callers: ['user'],
  goal: 'чтобы проверить схему',
  start: 'miniUi/todo/a',
  outcomes: [],
  startsFrom: [],
};

const entry = {
  via: 'entry',
  from: 'miniConsole',
  screen: 'miniUi/todo/a',
  name: 'start',
};
const notification = {
  via: 'notification',
  from: 'miniUi/todo/n',
  screen: 'miniUi/todo/a',
  event: 'example/todo/task/assigned',
};
const action = {
  via: 'action',
  from: 'miniUi/todo/x/go',
  screen: 'miniUi/todo/a',
};
const redirect = {
  via: 'redirect',
  from: 'miniUi/todo/t',
  screen: 'miniUi/todo/a',
};

const parse = (startsFrom: unknown) =>
  v.safeParse(UI_PROPS.story, { ...story, startsFrom });

describe('UI_PROPS.story: startsFrom', () => {
  test('принимает пустой список и записи всех четырёх видов', () => {
    expect(parse([]).success).toBe(true);
    expect(parse([entry, notification, action, redirect]).success).toBe(true);
  });

  test('отвергает props без startsFrom', () => {
    const { startsFrom: _omitted, ...without } = story;

    expect(v.safeParse(UI_PROPS.story, without).success).toBe(false);
  });

  test('отвергает запись с лишним ключом', () => {
    expect(parse([{ ...redirect, extra: 1 }]).success).toBe(false);
  });

  test('отвергает name у action и redirect', () => {
    expect(parse([{ ...action, name: 'go' }]).success).toBe(false);
    expect(parse([{ ...redirect, name: 'go' }]).success).toBe(false);
  });

  test('отвергает event у entry и entry без name', () => {
    expect(parse([{ ...entry, event: 'e' }]).success).toBe(false);
    const { name: _name, ...nameless } = entry;
    expect(parse([nameless]).success).toBe(false);
  });

  test('отвергает notification без event', () => {
    const { event: _event, ...eventless } = notification;

    expect(parse([eventless]).success).toBe(false);
  });

  test('отвергает неизвестный вид записи', () => {
    expect(parse([{ ...action, via: 'leads' }]).success).toBe(false);
  });
});
