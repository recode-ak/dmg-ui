import { type DomainError, ok, type Result } from 'dmg-core';
import type { ExampleUser } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  type AvailabilityFns,
  type DataOf,
  ScreenCode,
} from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  MainMenuScreenDef,
  ProfileSummaryScreenDef,
  TaskListScreenDef,
} from '../../../../platform/ui';

type Menu = typeof MainMenuScreenDef;

/**
 * Код меню «Начать работу»: переходы в сторис задач и профиля и выход.
 * Профиль — по субъекту беседы: без субъекта действие скрыто.
 */
export class MainMenuScreenCode extends ScreenCode<Menu, ExampleUser> {
  override readonly actions: Partial<ActionSteps<Menu, ExampleUser>> = {
    tasks: { done: () => TaskListScreenDef.at({ page: 0 }) },
    assigned: { done: () => AssignedTasksScreenDef.at({}) },
    profile: { done: () => ProfileSummaryScreenDef.at({}) },
    close: { done: () => MainMenuScreenDef.exits.closed.with() },
  };

  override readonly availability: Partial<AvailabilityFns<Menu, ExampleUser>> =
    {
      profile: ({ subject }) =>
        subject === undefined ? Availability.hidden() : Availability.yes(),
    };

  override async load(): Promise<Result<DataOf<Menu>, DomainError>> {
    return ok({});
  }
}
