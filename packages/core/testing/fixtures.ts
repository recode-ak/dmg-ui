// Вход dmg-ui/testing/fixtures: общие помощники тестов, которыми пользуются
// пакеты каналов. Ровно десять имён (D-UI-34, D-UI-69); остальные помощники
// ядра внутренние.

export { ExampleStubAppDef } from './ui-app-fixture';
export { ArchReport, UiScene } from './ui-arch';
export { StubViewProvider } from './ui-graph-fixture';
export {
  RuntimeKit,
  requestTrace,
  testRenderContext,
} from './ui-runtime-fixture';
export { exampleUser, oplogRecords, T0 } from './ui-server-fixture';
