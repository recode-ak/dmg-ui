// Привязка учебного примера к страничному каналу: приложение UI, маршруты,
// представления, размещение окна, субъект на проводе и граф примера; подставные часы и история
// вкладки для тестов без таймеров и без браузера. Отдельный вход от примера:
// тесты ядра, которым нужен только пример, не грузят канал, сервер и граф.

export { ExamplePagesArch } from './example/example-pages.arch';
export { examplePagesRoutes } from './example/example-pages.routes';
export { ExamplePagesUiAppDef } from './example/example-pages.ui-app';
export { examplePagesViews } from './example/example-pages.views';
export { exampleSubjectWire } from './example/example-subject.wire';
export { exampleWindowPlacements } from './example/example-window.placements';
export { ManualPageClock } from './manual-page-clock';
export { MemoryPageHistory } from './memory-page-history';
