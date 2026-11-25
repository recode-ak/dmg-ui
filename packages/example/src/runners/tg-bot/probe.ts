import { createInterface } from 'node:readline/promises';
import { ConsoleLogger } from 'dmg-core/app';
import { ExampleEnv } from './example-env';
import { ExampleProbe } from './example-probe';
import { RETIRING_PROBE } from './example-probe.const';
import { GrammyBotApi } from './grammy-bot-api';

// Вход пробы Bot API (D-UI-68): `bun run example:tg:probe <chat_id>`. Тот же
// токен и порт, что у примера, но без бесед и без опроса: набор сообщений в чат
// человека, затем по Enter — «ушедший экран» (проба Е7). Читает окружение
// только вход (ARC-09); токен и id чата в консоль не идут.

const env = ExampleEnv.read(process.env);
if (!env.ok) {
  console.error(`Окружение не годится: ${env.error.text}`);
  process.exit(1);
}
const chat = Number(process.argv[2]);
if (!Number.isSafeInteger(chat) || chat <= 0) {
  console.error('Использование: bun run example:tg:probe <chat_id>');
  process.exit(1);
}

const logger = new ConsoleLogger({ level: env.value.logLevel });
const probe = new ExampleProbe({
  api: GrammyBotApi.fromToken(env.value.token),
  chat,
  logger,
});

try {
  for (const result of await probe.runAll()) {
    console.log(
      `${result.id}: отправлено ${result.sent}, не доставлено ${result.failed}`,
    );
  }
  const input = createInterface({ input: process.stdin });
  await input.question(`Enter — убрать кнопки пробы ${RETIRING_PROBE}... `);
  input.close();
  await probe.retire(RETIRING_PROBE);
  console.log('Готово.');
} catch {
  console.error('Проба прервана: сбой Bot API или сети.');
  process.exit(1);
}
