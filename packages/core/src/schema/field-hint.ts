import * as v from 'valibot';

/** Ключ подсказки поля в метаданных схемы; он же ключ в JSON Schema графа. */
export const FIELD_HINT_KEY = 'hint';

/**
 * Подсказка поля в pipe его схемы, рядом с `v.title` и `v.examples`:
 * `v.pipe(v.string(), v.title('Название'), fieldHint('Коротко, что сделать'))`.
 * Ключ называется только здесь: опечатка в `v.metadata({ hint })` молчала бы.
 * Подсказка необязательна, но не пустая: пустой текст — бросок, как ошибка
 * программиста; нет подсказки — нет вызова.
 */
export function fieldHint<TInput>(
  text: string,
): v.MetadataAction<TInput, { readonly hint: string }> {
  if (text.trim() === '') {
    throw new Error(
      'Пустая подсказка поля: уберите fieldHint или заполните текст',
    );
  }
  return v.metadata({ [FIELD_HINT_KEY]: text });
}
