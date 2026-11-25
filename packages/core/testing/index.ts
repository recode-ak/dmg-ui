// Вход dmg-ui/testing (D-UI-32): помощник рендера примеров, наблюдатель в
// памяти и проверка имён файлов UI (NM-01, D-UI-112). Учебный проект живёт
// отдельно — вход dmg-ui/example; заглушки портов, сцены правил графа и
// заглушки сервера — внутренние помощники тестов ядра; общие помощники тестов
// каналов — вход dmg-ui/testing/fixtures.

export { MemoryUiObserver } from './memory-ui-observer';
export {
  ExamplePreview,
  type ExamplePreviewSpec,
  type ExampleRenderer,
} from './preview';
export { UiFileNames } from './ui-file-names';
export type {
  UiNamesLayout,
  UiNamesSource,
  UiNamesViolation,
} from './ui-file-names.types';
