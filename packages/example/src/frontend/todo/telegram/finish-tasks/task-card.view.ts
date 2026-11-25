import { ScreenPresenter, TextBuilder } from 'dmg-ui/chat-ui';
import { TaskCardScreenDef } from '../../../../platform/ui';
import {
  EXAMPLE_MOMENT,
  EXAMPLE_MOMENT_FALLBACK,
  EXAMPLE_MOMENT_LABEL,
} from '../../../telegram-kit/example-moment.const';
import { todoChatViews } from '../../chat/todo-chat.views';
import { AccentedOutput } from '../shared/accented-output';

const common = todoChatViews.screen(TaskCardScreenDef);

/**
 * Карточка задачи под Telegram (D-UI-67): общее представление, «Выполнить» —
 * акцент `positive`; у открытой задачи в конце — момент `EXAMPLE_MOMENT`.
 */
export const TaskCardView = ScreenPresenter.of(TaskCardScreenDef, {
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
