import { TaskErrors } from 'dmg-core/testing/example';
import { UiIds } from 'dmg-ui';
import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { exampleDialogViews } from 'dmg-ui/chat-ui/testing';
import { ExampleUiSetDef, TaskListScreenDef } from 'dmg-ui/testing';
import { AccentedOutput } from './accented-output';

const common = exampleDialogViews.screen(
  new UiIds(ExampleUiSetDef).screen(TaskListScreenDef),
);
const tooMany = common.caught(TaskErrors.TOO_MANY_OPEN.code);

/**
 * Список задач под Telegram (D-UI-67): общее представление, «Выполнить
 * выбранные» — акцент `positive`; тексты и отказы те же.
 */
export const TaskListTelegramView = ScreenPresenter.of(TaskListScreenDef, {
  render: (view, kit) =>
    AccentedOutput.of(common.render(view, kit))
      .accent('completeSelected', 'positive')
      .build(),
  caught:
    tooMany === undefined ? {} : { [TaskErrors.TOO_MANY_OPEN.code]: tooMany },
});
