import { UiIds } from 'dmg-ui';
import { ScreenPresenter, TextBuilder } from 'dmg-ui/chat-ui';
import { exampleDialogViews } from 'dmg-ui/chat-ui/testing';
import { ExampleUiSetDef, TaskCardScreenDef } from 'dmg-ui/testing';
import { AccentedOutput } from './accented-output';
import {
  EXAMPLE_MOMENT,
  EXAMPLE_MOMENT_FALLBACK,
  EXAMPLE_MOMENT_LABEL,
} from './example-telegram.const';

const common = exampleDialogViews.screen(
  new UiIds(ExampleUiSetDef).screen(TaskCardScreenDef),
);

/**
 * Карточка задачи под Telegram (D-UI-67): общее представление, «Выполнить» —
 * акцент `positive`; у открытой задачи в конце — момент `EXAMPLE_MOMENT`.
 */
export const TaskCardTelegramView = ScreenPresenter.of(TaskCardScreenDef, {
  render: (view, kit) => {
    const output = AccentedOutput.of(common.render(view, kit)).accent(
      'complete',
      'positive',
    );
    if (view.data?.status !== 'open') return output.build();
    return output
      .text((text) => [
        ...text,
        ...new TextBuilder()
          .line()
          .text(EXAMPLE_MOMENT_LABEL)
          .moment(
            EXAMPLE_MOMENT_FALLBACK,
            EXAMPLE_MOMENT.at,
            EXAMPLE_MOMENT.show,
          )
          .build(),
      ])
      .build();
  },
});
