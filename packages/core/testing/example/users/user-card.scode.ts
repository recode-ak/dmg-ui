import type { DomainError, Result } from 'dmg-core';
import { GetUserUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import { TaskListScreenDef } from '../todo/task-list.screen';
import { UserCardScreenDef } from './user-card.screen';

type Card = typeof UserCardScreenDef;

/** Код карточки пользователя: данные — ответ `getUser` по `params.userId`. */
export class UserCardScreenCode extends ScreenCode<Card> {
  override readonly actions: Partial<ActionSteps<Card>> = {
    tasks: { done: () => TaskListScreenDef.at({ page: 0 }) },
    close: { done: () => UserCardScreenDef.exits.closed.with() },
  };

  override async load({
    params,
    read,
  }: LoadContext<Card>): Promise<Result<DataOf<Card>, DomainError>> {
    return read(GetUserUcDef, { userId: params.userId });
  }
}
