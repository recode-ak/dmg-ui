import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConsoleLogger, InProcEventBus } from 'dmg-core/app';
import { ExampleBot } from './example-bot';
import { ENTRY_POINTS, EXAMPLE_USER_B } from './example-bot.const';
import { ExampleEnv } from './example-env';
import { GrammyPolling } from './grammy-polling';
import { TracingBotApi } from './tracing-bot-api';

// Вход примера (D-UI-68): единственный читатель окружения (ARC-09). Отказ
// окружения печатает имя переменной без значений и завершает процесс.
// Ни токена, ни id людей в консоль не идёт.

const env = ExampleEnv.read(process.env);
if (!env.ok) {
  console.error(`Окружение не годится: ${env.error.text}`);
  process.exit(1);
}
const { token, users, logLevel, tracePath, dataDir } = env.value;

const logger = new ConsoleLogger({ level: logLevel });
const { polling, api: botApi } = GrammyPolling.connect(token, logger);
const api = new TracingBotApi({
  api: botApi,
  ...(tracePath !== undefined ? { path: tracePath } : {}),
  logger,
});

const me = await polling.identify().catch(() => {
  console.error('Не удалось получить данные бота: проверьте токен и сеть.');
  process.exit(1);
});
const example = new ExampleBot({
  api,
  bot: me.id,
  users,
  logger,
  bus: new InProcEventBus(logger),
  dataDir: dataDir ?? (await mkdtemp(join(tmpdir(), 'example-tg-'))),
});

let stopping = false;
const shutdown = async (): Promise<void> => {
  if (stopping) return;
  stopping = true;
  await polling.stop();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await example.start();
const commands = ENTRY_POINTS.filter((point) => point.via === 'menu').length;
console.log(
  `Готов: @${me.username}. Пользователь B для «Назначить»: ${EXAMPLE_USER_B}. Команд меню: ${commands}.`,
);

try {
  await polling.start(example);
} catch (error) {
  if (GrammyPolling.isConflict(error)) {
    console.error(
      'Конфликт getUpdates (409): на этом токене уже работает другой исполнитель. Остановите его и запустите пример снова.',
    );
  } else {
    console.error('Опрос остановлен из-за ошибки Bot API.');
  }
  await example.close();
  process.exit(1);
}
await example.close();
