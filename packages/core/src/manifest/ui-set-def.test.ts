import { describe, expect, test } from 'bun:test';
import { ExampleUiSetDef } from 'dmg-ui/example';

describe('UiSetDef', () => {
  test('форма: доменное приложение и UI-модули — именами', () => {
    expect(ExampleUiSetDef.normalize()).toEqual({
      dmg: 'uiSet',
      name: 'exampleUi',
      label: 'UI учебного приложения',
      description: 'Набор UI-модулей поверх учебного приложения.',
      visible: false,
      app: 'example',
      modules: ['todo', 'users'],
    });
  });
});
