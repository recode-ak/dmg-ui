import { CodeLoader, CodeLoaders } from 'dmg-ui';
import type { ExampleCodeOverrides } from '../example-codes.types';
import { UserCardScreenDef } from './user-card.screen';
import { UsersUiModuleDef } from './users.ui-module';

/** Реестр кода модуля `users` примера; `over` подменяет код карточки. */
export const usersCodes = (over: ExampleCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(UsersUiModuleDef, [
    CodeLoader.screen(
      UserCardScreenDef,
      async () =>
        over.user ??
        new (await import('./user-card.scode')).UserCardScreenCode(),
    ),
  ]);
