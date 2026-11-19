// Публичный вход ядра dmg-ui: манифесты UI, адрес, логика и исполнитель экрана.

export { Address } from './address/address';
export {
  AddressCodec,
  type AddressJson,
  type AddressRejection,
} from './address/address-codec';
export { UiIds } from './address/ui-ids';
export { type ExitTarget, ExitTargets } from './manifest/exit-targets';
export type { NormalizedSchema } from './manifest/normalized.types';
export {
  type AnyNotificationDef,
  type NormalizedNotification,
  type NormalizedRecipients,
  NotificationDef,
  type NotificationExampleSpec,
  type NotificationSpec,
  type RecipientsSpec,
} from './manifest/notification-def';
export { RefreshOn } from './manifest/refresh-on';
export { ScreenAction } from './manifest/screen-action';
export {
  type ActionSpec,
  type AnyScreenDef,
  type DataOf,
  type EmptyParams,
  type ExitSpec,
  type InputSchema,
  type InputSchemaOf,
  type ItemTexts,
  type LocalSpec,
  type NormalizedAction,
  type NormalizedExit,
  type NormalizedLocal,
  type NormalizedRefresh,
  type NormalizedScreen,
  type ParamsOf,
  type ParamsSchemaOf,
  type RefreshSpec,
  type ScreenActions,
  ScreenDef,
  type ScreenExampleSpec,
  type ScreenExits,
  type ScreenLocals,
  type ScreenSpec,
  type StateOf,
  type StateSchemaOf,
  type StrictSchema,
  type UcOf,
} from './manifest/screen-def';
export { type ExitValue, ScreenExit } from './manifest/screen-exit';
export { ScreenLocal } from './manifest/screen-local';
export {
  type AnyStoryDef,
  type NormalizedAfter,
  type NormalizedOutcome,
  type NormalizedStory,
  type OutcomeAfter,
  type OutcomeSpec,
  StoryDef,
  type StorySpec,
} from './manifest/story-def';
export {
  type AnyUiAppDef,
  type EntrySpec,
  type NormalizedEntry,
  type NormalizedUiApp,
  UiAppDef,
  type UiAppSpec,
} from './manifest/ui-app-def';
export {
  type AnyUiModuleDef,
  type NormalizedUiModule,
  UiModuleDef,
  type UiModuleSpec,
} from './manifest/ui-module-def';
export {
  type AnyUiSetDef,
  type NormalizedUiSet,
  UiSetDef,
  type UiSetSpec,
} from './manifest/ui-set-def';
export type { ActRequest, LocalRequest } from './runtime/action-run';
export { CodeLoader, CodeLoaders } from './runtime/code-loaders';
export type { RenderContext, ViewContext } from './runtime/context.types';
export {
  NotificationCode,
  type NotificationDataOf,
  type NotificationLoadContext,
} from './runtime/notification-code';
export type {
  ActionOutcome,
  ActionView,
  InstanceJson,
  InstanceView,
  LocalOutcome,
  LocalView,
  Refusal,
  ScreenViewOf,
  UnavailableReason,
  ViewChange,
} from './runtime/outcome.types';
export type {
  RefreshPort,
  RefreshSignal,
  UcCall,
  UcPort,
} from './runtime/ports.types';
export type { ScreenInstance } from './runtime/screen-instance';
export {
  type NotificationPreview,
  ScreenPreview,
  type ScreenPreviewSpec,
} from './runtime/screen-preview';
export {
  type OpenOptions,
  ScreenRuntime,
  type ScreenRuntimeSpec,
} from './runtime/screen-runtime';
export type {
  UiFault,
  UiObserver,
  UiRecord,
} from './runtime/ui-observer.types';
export type { FieldIssue } from './schema/schema-check';
export type { ActionContext, Place } from './screen/action-context.types';
export {
  type ActionField,
  ActionInput,
  type InputRejection,
} from './screen/action-input';
export { Availability, type ViewAvailability } from './screen/availability';
export {
  type ActionStep,
  type ActionSteps,
  type AvailabilityContext,
  type AvailabilityFn,
  type AvailabilityFns,
  type Choice,
  type FieldChoices,
  type FieldValues,
  type InputOf,
  type LoadContext,
  type LocalFn,
  type LocalFns,
  type ReadPort,
  ScreenCode,
  type StepContext,
  type UcInputFor,
  type UcOutputFor,
} from './screen/screen-code';
export {
  type ActionName,
  type LocalName,
  ScreenLogic,
} from './screen/screen-logic';
export type { Transition } from './screen/transition.types';
