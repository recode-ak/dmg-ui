import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  CodeLoader,
  CodeLoaders,
  type FieldChoices,
  ScreenCode,
  ScreenDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, requestTrace } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { PageForms } from './page-forms';

// Вход формой на локальном Def: в учебном примере нет действия с двумя
// обязательными полями. Форма отправляет все поля разом — замечания
// `rejected` приходят по каждому полю одним `act`.

/** Форма: вид с вариантами, обязательный текст и необязательная заметка. */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Действие с двумя обязательными полями.',
  reads: [],
  data: v.object({}),
  actions: {
    send: {
      label: 'Отправить',
      description: 'Собирает поля формы.',
      input: v.object({
        kind: v.pipe(v.picklist(['a', 'b']), v.description('Вид')),
        title: v.pipe(
          v.string(),
          v.nonEmpty('Нужно название'),
          v.description('Название'),
        ),
        note: v.optional(v.pipe(v.string(), v.description('Заметка'))),
      }),
    },
    ping: { label: 'Пинг', description: 'Действие без входа.' },
  },
});

class FormCode extends ScreenCode<typeof FormScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof FormScreenDef>> = {
    send: { done: () => FormScreenDef.at({}) },
    ping: { done: () => FormScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override choices(name: string): FieldChoices {
    if (name !== 'send') return {};
    return {
      kind: [
        { value: 'a', label: 'Первый' },
        { value: 'b', label: 'Второй' },
      ],
    };
  }
}

const FormSetDef = UiSetDef.define({
  name: 'formUi',
  label: 'Набор формы',
  description: 'Локальный экран формы.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'forms',
      label: 'Формы',
      description: 'Одна форма.',
      screens: [FormScreenDef],
      stories: [],
    }),
  ],
});

/** Экземпляр формы и поля действия `name` из его вида. */
const opened = async (name: string) => {
  const kit = new RuntimeKit(
    CodeLoaders.of(FormSetDef, [
      CodeLoader.screen(FormScreenDef, async () => new FormCode()),
    ]),
    FormSetDef,
  );
  const instance = await kit.runtime.open(
    FormScreenDef.at({}),
    RuntimeKit.options(),
  );
  const view = instance.view();
  const fields = view.actions.find((a) => a.name === name)?.fields ?? [];
  return { instance, revision: view.revision, fields };
};

const forms = new PageForms();

describe('PageForms', () => {
  test('rejected — замечания всех полей одним act: оба обязательных не по схеме', async () => {
    const { instance, revision, fields } = await opened('send');

    const outcome = await instance.act({
      action: 'send',
      input: forms.input(fields, { kind: 'Третий', title: '' }),
      revision,
      trace: requestTrace('r-1'),
    });

    expect(outcome.kind).toBe('rejected');
    const issues = outcome.kind === 'rejected' ? outcome.issues : [];
    expect(issues.map((issue) => issue.field)).toEqual(['kind', 'title']);
  });

  test('подпись варианта — его значение; необязательное пустое и чужие поля опускаются', async () => {
    const { fields } = await opened('send');

    const input = forms.input(fields, {
      kind: 'Второй',
      title: 'Хлеб',
      note: '',
      extra: 'x',
    });

    expect(input).toStrictEqual({ kind: 'b', title: 'Хлеб' });
  });

  test('значение без совпадения с подписью — как есть: его проверит схема', async () => {
    const { fields } = await opened('send');

    expect(forms.input(fields, { kind: 'a', title: 'Хлеб' })).toStrictEqual({
      kind: 'a',
      title: 'Хлеб',
    });
  });

  test('действие без полей — входа нет', async () => {
    const { fields } = await opened('ping');

    expect(forms.input(fields, { anything: 'x' })).toBeUndefined();
  });
});
