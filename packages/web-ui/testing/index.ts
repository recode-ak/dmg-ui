// Привязка учебного примера к страничному каналу: приложение UI, маршруты,
// представления и граф примера; подставные часы вкладки для тестов без
// таймеров. Отдельный вход от примера: тесты ядра, которым нужен только
// пример, не грузят канал, сервер и граф.

export { ExamplePagesAppDef } from './example/example-pages.app';
export { ExamplePagesArch } from './example/example-pages.arch';
export { examplePageRoutes } from './example/example-pages.routes';
export { examplePageViews } from './example/example-pages.views';
export { ManualPageClock } from './manual-page-clock';
