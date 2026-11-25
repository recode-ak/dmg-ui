import type { DomainError, Result } from 'dmg-core';
import { type ExampleUser, GetUserUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import {
  ProfileSummaryScreenDef,
  UserCardScreenDef,
} from '../../../../platform/ui';

type Summary = typeof ProfileSummaryScreenDef;

/**
 * Код профиля: данные — ответ `getUser` по субъекту беседы; карточка
 * открывается по `userId` из данных. Вход в экран скрыт без субъекта, поэтому
 * загрузка без него — дефект кода, а не штатный путь.
 */
export class ProfileSummaryScreenCode extends ScreenCode<Summary, ExampleUser> {
  override readonly actions: Partial<ActionSteps<Summary, ExampleUser>> = {
    card: { done: ({ data }) => UserCardScreenDef.at({ userId: data.userId }) },
    close: { done: () => ProfileSummaryScreenDef.exits.closed.with() },
  };

  override async load({
    read,
    context,
  }: LoadContext<Summary, ExampleUser>): Promise<
    Result<DataOf<Summary>, DomainError>
  > {
    if (context.subject === undefined) {
      throw new Error('profileSummary без субъекта');
    }
    return read(GetUserUcDef, { userId: context.subject.uuid });
  }
}
