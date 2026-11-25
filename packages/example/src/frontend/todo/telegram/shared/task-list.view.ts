import { TaskErrors } from 'dmg-core/testing/example';
import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { TaskListScreenDef } from '../../../../platform/ui';
import { todoChatViews } from '../../chat/todo-chat.views';
import { AccentedOutput } from './accented-output';

const common = todoChatViews.screen(TaskListScreenDef);
const tooMany = common.caught(TaskErrors.TOO_MANY_OPEN.code);

/**
 * Список задач под Telegram (D-UI-67): общее представление, «Выполнить
 * выбранные» — акцент `positive`; тексты и отказы те же.
 */
export const TaskListView = ScreenPresenter.of(TaskListScreenDef, {
  render: (view, kit) =>
    AccentedOutput.of(common.render(view, kit))
      .accent('completeSelected', 'positive')
      .build(),
  caught:
    tooMany === undefined ? {} : { [TaskErrors.TOO_MANY_OPEN.code]: tooMany },
});
