import { describe, expect, test } from 'bun:test';
import { testUuid } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import { exampleSubjectWire } from './example-subject.wire';

// Привязка субъекта учебного примера к проводу страницы: на сервере субъект
// переводится в `{ uuid, roles }`, на клиенте восстанавливается из строгой
// схемы. Лишнее и нестрогое — отказ восстановления, а не молчаливая подмена.

const ID = testUuid(1);
const user: ExampleUser = { uuid: ID, hasRole: () => false };
const admin: ExampleUser = { uuid: ID, hasRole: (role) => role === 'admin' };

/** Субъект так, как он проходит провод: JSON в обе стороны. */
const viaJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

describe('exampleSubjectWire.toWire', () => {
  test('пользователь без ролей — uuid и пустой список ролей, больше ничего', () => {
    expect(exampleSubjectWire.toWire(user)).toStrictEqual({
      uuid: ID,
      roles: [],
    });
  });

  test('администратор — роль admin в списке', () => {
    expect(exampleSubjectWire.toWire(admin)).toStrictEqual({
      uuid: ID,
      roles: ['admin'],
    });
  });
});

describe('exampleSubjectWire.revive', () => {
  test('круг toWire → JSON → revive сохраняет uuid и роль', () => {
    const revived = exampleSubjectWire.revive(
      viaJson(exampleSubjectWire.toWire(admin)),
    );

    expect(revived.uuid).toBe(ID);
    expect(revived.hasRole('admin')).toBe(true);
  });

  test('без роли hasRole(admin) — ложь', () => {
    const revived = exampleSubjectWire.revive({ uuid: ID, roles: [] });

    expect(revived.hasRole('admin')).toBe(false);
  });

  test('восстановленное — простой объект: uuid и hasRole', () => {
    const revived = exampleSubjectWire.revive({ uuid: ID, roles: [] });

    expect(Object.keys(revived).sort()).toEqual(['hasRole', 'uuid']);
  });

  test.each([
    ['лишний ключ', { uuid: ID, roles: [], extra: 1 }],
    ['нет uuid', { roles: [] }],
    ['roles не список', { uuid: ID, roles: 'admin' }],
    ['роль не строка', { uuid: ID, roles: [1] }],
    ['не объект', 'admin'],
    ['null', null],
  ])('%s — бросок: субъект не восстановлен', (_name, raw) => {
    expect(() => exampleSubjectWire.revive(raw)).toThrow();
  });
});
