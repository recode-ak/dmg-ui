import { EXAMPLE_PATHS } from '../common/example-web.const';
import { ExamplePage } from './example-page';

// Точка входа клиента: единственное место, где читаются окно, документ и
// адрес страницы. Корень — `<body>`: шапка и навигация страницы остаются
// на месте, раскладку областей строит клиент.

const secure = location.protocol === 'https:';
const socketUrl = `${secure ? 'wss' : 'ws'}://${location.host}${EXAMPLE_PATHS.socket}`;

void new ExamplePage({
  browser: window,
  root: document.body,
  origin: location.origin,
  connect: () => new WebSocket(socketUrl),
  reload: () => location.reload(),
  log: (text) => console.error(text),
}).start();
