// Привязка учебного примера к страничному каналу: приложение UI, маршруты,
// представления и граф примера. Отдельный вход от примера: тесты ядра,
// которым нужен только пример, не грузят канал, сервер и граф.

export { ExamplePagesAppDef } from './example-pages.app';
export { ExamplePagesArch } from './example-pages.arch';
export { examplePageRoutes } from './example-pages.routes';
export { examplePageViews } from './example-pages.views';
