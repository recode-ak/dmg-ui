import { describe, expect, test } from 'bun:test';
import { ExampleAppDef } from 'dmg-core/testing/example';
import { UiModuleDef } from './ui-module-def';
import { UiSetDef } from './ui-set-def';

/** Модуль сцены без экранов и сторис: форме набора нужно только имя. */
const moduleOf = (name: string) =>
  UiModuleDef.define({
    name,
    label: `Модуль ${name}`,
    description: 'Модуль сцены формы набора.',
    screens: [],
    stories: [],
  });

describe('UiSetDef', () => {
  test('форма: доменное приложение и UI-модули — именами, в порядке набора', () => {
    const set = UiSetDef.define({
      name: 'deskUi',
      label: 'UI стола',
      description: 'Набор из двух модулей.',
      app: ExampleAppDef,
      modules: [moduleOf('tasks'), moduleOf('people')],
    });

    expect(set.normalize()).toEqual({
      dmg: 'uiSet',
      name: 'deskUi',
      label: 'UI стола',
      description: 'Набор из двух модулей.',
      visible: false,
      app: 'example',
      modules: ['tasks', 'people'],
    });
  });
});
