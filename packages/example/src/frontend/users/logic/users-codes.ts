import { CodeLoader, CodeLoaders } from 'dmg-ui';
import { UserCardScreenDef, UsersUiModuleDef } from '../../../platform/ui';
import type { UsersCodeOverrides } from './users-codes.types';

/** Реестр кода модуля `users` примера; `over` подменяет код карточки. */
export const usersCodes = (over: UsersCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(UsersUiModuleDef, [
    CodeLoader.screen(
      UserCardScreenDef,
      async () =>
        over.user ??
        new (await import('./view-user/user-card.scode')).UserCardScreenCode(),
    ),
  ]);
