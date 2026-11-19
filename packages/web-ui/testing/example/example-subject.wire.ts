import type { ExampleUser } from 'dmg-core/testing/example';
import * as v from 'valibot';

/** Субъект примера на проводе страницы: строго `uuid` и роли, больше ничего. */
const SubjectWire = v.strictObject({
  uuid: v.string(),
  roles: v.array(v.string()),
});

/**
 * Привязка субъекта учебного примера к проводу страницы (D-UI-99): сервер
 * (`PageHostSpec.subjectToWire`) переводит субъекта вызывающего — у
 * заместителя это принципал — в `{ uuid, roles }`, клиент
 * (`PageClientSpec.reviveSubject`) восстанавливает его по строгой схеме.
 * Не по схеме — бросок: субъект не восстановлен. Роли учебного приложения —
 * только `admin`.
 */
export const exampleSubjectWire = {
  toWire: (subject: ExampleUser): v.InferOutput<typeof SubjectWire> => ({
    uuid: subject.uuid,
    roles: subject.hasRole('admin') ? ['admin'] : [],
  }),

  revive: (raw: unknown): ExampleUser => {
    const { uuid, roles } = v.parse(SubjectWire, raw);
    return { uuid, hasRole: (role) => roles.includes(role) };
  },
} as const;
