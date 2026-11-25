import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { ClientBundle } from './client-bundle';

// Домен на клиенте (D-UI-93): домен учебного модуля (Ar, Policy, Rules) и коды
// экранов собираются под браузер без кода сервера. Ar, Policy и Rules берутся
// со стабильного входа `dmg-core/testing/example`.

const ROOT = resolve(import.meta.dir, '../../../../../..');

/** Виртуальный вход внутри репо: ни один файл на диск не пишется. */
const virtual = (name: string, text: string) => {
  const entry = join(
    ROOT,
    'packages/example/src/runners/web',
    `__virtual_${name}.ts`,
  );
  return { entry, files: { [entry]: text } };
};

const DOMAIN = `
import { TaskAr, TaskPolicy, TaskRules } from 'dmg-core/testing/example';
import { exampleCodes } from '../example-codes';
export const domain = { TaskAr, TaskPolicy, TaskRules, exampleCodes };
`;

describe('ClientBundle — домен на клиенте', () => {
  test('Ar, Policy, Rules и коды экранов — сборка без нарушений и без кода сервера', async () => {
    const bundle = await ClientBundle.build(virtual('domain', DOMAIN));

    expect(ClientBundle.violations(bundle)).toEqual([]);
    for (const name of ['task.policy.ts', 'task.rules.ts', 'task.ar.ts']) {
      expect(bundle.inputs.some((input) => input.endsWith(name))).toBe(true);
    }
    const has = (part: string) => bundle.inputs.some((i) => i.includes(part));
    expect(has('dmg-core/src/app/')).toBe(false);
    expect(has('testing/example/backend/')).toBe(false);
    expect(has('testing/example/runners/')).toBe(false);
    expect(bundle.outputs).toBe(1);
  });

  test("тот же вход + import 'node:fs' — нарушение называет node:fs", async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'domain-fs',
        `${DOMAIN}import { readFileSync } from 'node:fs'; export const f = readFileSync;`,
      ),
    );

    expect(ClientBundle.violations(bundle).join('\n')).toContain('node:fs');
  });

  test('использованный ExampleApp — backend/, runners/, node:*, Bun./process. в нарушениях', async () => {
    const bundle = await ClientBundle.build(
      virtual(
        'domain-app',
        "import { ExampleApp } from 'dmg-core/testing/example'; export const a = ExampleApp;",
      ),
    );
    const found = ClientBundle.violations(bundle).join('\n');

    expect(found).toContain('dmg-core/src/app/');
    expect(found).toContain('dmg-core/src/testing/example/backend/');
    expect(found).toContain('dmg-core/src/testing/example/runners/');
    expect(found).toContain('node:');
    expect(found).toContain('Bun\\.');
    expect(found).toContain('process\\.');
  });
});

const AVAILABILITY = `
import { TaskAr, TaskPolicy, TaskRules } from 'dmg-core/testing/example';
import { Availability } from 'dmg-ui';
import { exampleCodes } from '../example-codes';
export const client = { Availability, TaskAr, TaskPolicy, TaskRules, exampleCodes };
`;

describe('ClientBundle — доступность на клиенте', () => {
  test('Availability, домен и коды экранов — сборка без нарушений: ни node:*, ни dmg-core/src/app/', async () => {
    const bundle = await ClientBundle.build(
      virtual('availability', AVAILABILITY),
    );

    expect(ClientBundle.violations(bundle)).toEqual([]);
    expect(
      bundle.inputs.some((input) => input.endsWith('availability.ts')),
    ).toBe(true);
    expect(bundle.imports.filter((path) => /^(node|bun):/.test(path))).toEqual(
      [],
    );
    expect(bundle.inputs.some((i) => i.includes('dmg-core/src/app/'))).toBe(
      false,
    );
  });
});
