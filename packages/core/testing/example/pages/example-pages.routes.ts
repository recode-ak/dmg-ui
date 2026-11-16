import { PageRouteDef } from '../../page/graph/page-route-def';

/** Маршруты учебного примера: путь страницы — вход приложения UI. */
export const examplePageRoutes = [
  PageRouteDef.define({
    name: 'tasks',
    label: 'Мои задачи',
    description: 'Главная страница: список своих задач.',
    visible: true,
    path: '/',
    entry: 'start',
  }),
  PageRouteDef.define({
    name: 'assigned',
    label: 'Назначенные мне',
    description: 'Страница поручений вызывающему.',
    visible: true,
    path: '/assigned',
    entry: 'assigned',
  }),
] as const;
