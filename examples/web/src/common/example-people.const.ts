import type { ExamplePerson } from './example-people.types';

/** Люди примера: те же uuid, что у учебных пользователей A и B учебного мира. */
export const EXAMPLE_PEOPLE: readonly ExamplePerson[] = [
  { key: 'anna', name: 'Анна', uuid: '00000000-0000-4000-8000-000000000001' },
  { key: 'boris', name: 'Борис', uuid: '00000000-0000-4000-8000-000000000002' },
];
