import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger } from 'dmg-core/app';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { ExampleDataDir } from './example-data-dir';
import { ExampleEnv } from './example-env';
import { ExampleWebServer } from './example-web-server';

// Вход примера: единственный читатель окружения и сигналов (ARC-09). Отказ
// окружения печатает имя переменной без значения и завершает процесс. Ни
// пропусков, ни заголовков запросов, ни адресов из браузера в консоль не идёт.

const env = ExampleEnv.read(process.env);
if (!env.ok) {
  console.error(`Окружение не годится: ${env.error.text}`);
  process.exit(1);
}
const { port, delayMs, logLevel } = env.value;
// Стабильный каталог: данные и пропуска переживают перезапуск (нужно для
// проверки остановки и запуска); начать с чистого — удалить его.
const dataDir = env.value.dataDir ?? join(tmpdir(), 'dmg-ui-example-web');

try {
  await ExampleDataDir.prepare(
    dataDir,
    process.getuid?.(),
    env.value.dataDir === undefined,
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Каталог данных не годится',
  );
  process.exit(1);
}

const server = await ExampleWebServer.start({
  port,
  dataDir,
  delayMs,
  ...(process.getuid === undefined ? {} : { uid: process.getuid() }),
  logger: new ConsoleLogger({ level: logLevel }),
}).catch(() => {
  console.error(
    'Не удалось запустить сервер: порт занят или сборка клиента не удалась.',
  );
  return process.exit(1);
});

let stopping = false;
const shutdown = async (): Promise<void> => {
  // Второй сигнал — выход сразу.
  if (stopping) process.exit(1);
  stopping = true;
  await server.stop();
  console.log('Остановлен.');
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

const [local, loopback] = server.origins;
const people = EXAMPLE_PEOPLE.map((person) => person.name).join(', ');
console.log(`Готов: ${local} и ${loopback}. Люди: ${people}.`);
console.log(`Каталог данных: ${dataDir}`);
if (delayMs > 0) console.log(`Медленный сервер: команды ждут ${delayMs} мс.`);
