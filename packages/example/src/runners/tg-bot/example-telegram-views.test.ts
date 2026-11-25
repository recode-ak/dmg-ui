import { describe, expect, test } from 'bun:test';
import { ChatExamples, ExampleLimits } from 'dmg-ui/chat-ui/testing';
import { TELEGRAM_CAPABILITIES } from 'dmg-ui/tg-bot';
import { ExampleUiSetDef } from '../../platform/ui';
import { ExampleDialogUiAppDef } from '../dialog/example-dialog.ui-app';
import { exampleCodes } from '../example-codes';
import { EXAMPLE_CONTEXT } from './example-telegram.const';
import { exampleTelegramViews } from './example-telegram-views';

// Сборка представлений учебного примера под Telegram на возможностях
// Telegram: лимиты примеров (CH-01) меряет тест на сборке приложения;
// примеры — с субъектом примеров (D-UI-99).

describe('сборка представлений Telegram учебного примера', () => {
  test('CH-01: перекрытие Telegram в лимитах TELEGRAM_CAPABILITIES — нарушений нет', async () => {
    const examples = await ChatExamples.collect({
      set: ExampleUiSetDef,
      codes: exampleCodes(),
      context: EXAMPLE_CONTEXT,
    });

    expect(
      new ExampleLimits(examples).check(
        exampleTelegramViews(ExampleDialogUiAppDef),
        TELEGRAM_CAPABILITIES,
      ),
    ).toEqual([]);
  });
});
