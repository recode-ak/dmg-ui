// Привязка учебного примера к страничному каналу: приложение UI, маршруты,
// представления и граф примера. Отдельный вход от примера: тесты ядра,
// которым нужен только пример, не грузят канал, сервер и граф.

export { ExamplePagesAppDef } from './example/example-pages.app';
export { ExamplePagesArch } from './example/example-pages.arch';
export { examplePageRoutes } from './example/example-pages.routes';
export { examplePageViews } from './example/example-pages.views';
