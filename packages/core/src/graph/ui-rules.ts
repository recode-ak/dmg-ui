import type { GraphRule } from 'dmg-core/graph';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { CatchesOfUcRule } from './rules/catches-of-uc.rule';
import { EventNodeCommandRule } from './rules/event-node-command.rule';
import { ExamplesBySchemaRule } from './rules/examples-by-schema.rule';
import { ExitTargetsRule } from './rules/exit-targets.rule';
import { ExitWithoutOutcomeRule } from './rules/exit-without-outcome.rule';
import { FilledTextsRule } from './rules/filled-texts.rule';
import { InvokesOnlyCommandRule } from './rules/invokes-only-command.rule';
import { LocalActionNamesRule } from './rules/local-action-names.rule';
import { OrphanReferenceRule } from './rules/orphan-reference.rule';
import { PrimaryActionRule } from './rules/primary-action.rule';
import { ReadsOnlyQueryRule } from './rules/reads-only-query.rule';
import { RecipientFieldsRule } from './rules/recipient-fields.rule';
import { RefreshRecordRule } from './rules/refresh-record.rule';
import { SchemaFieldTextsRule } from './rules/schema-field-texts.rule';
import { ScreenUsesHiddenRule } from './rules/screen-uses-hidden.rule';
import { ScreenWithoutPresentationRule } from './rules/screen-without-presentation.rule';
import { ScreenWithoutStoryRule } from './rules/screen-without-story.rule';
import { SensitiveExamplesRule } from './rules/sensitive-examples.rule';
import { StoryCallersRule } from './rules/story-callers.rule';
import { StoryFormRule } from './rules/story-form.rule';
import { StoryLeadsRule } from './rules/story-leads.rule';
import { StrictParamsRule } from './rules/strict-params.rule';
import { TransitionOutsideAppRule } from './rules/transition-outside-app.rule';
import { TransitionOutsideStoryRule } from './rules/transition-outside-story.rule';
import { UnreachableScreenRule } from './rules/unreachable-screen.rule';
import { UnsupportedFieldKindRule } from './rules/unsupported-field-kind.rule';
import { VisibleWithoutScreenRule } from './rules/visible-without-screen.rule';

/** Правила графа ядра UI. */
export class UiRules {
  private constructor(private readonly set: AnyUiSetDef) {}

  /**
   * Правила по порядку ID: UI-01…UI-27. Набор нужен только UI-20 (примеры
   * проверяются схемами valibot); `UiIds` здесь не строится и не бросает.
   */
  static of(set: AnyUiSetDef): readonly GraphRule[] {
    return new UiRules(set).list();
  }

  private list(): readonly GraphRule[] {
    return [
      new StoryCallersRule(),
      new ScreenWithoutStoryRule(),
      new TransitionOutsideStoryRule(),
      new ExitWithoutOutcomeRule(),
      new TransitionOutsideAppRule(),
      new ScreenWithoutPresentationRule(),
      new UnreachableScreenRule(),
      new ReadsOnlyQueryRule(),
      new InvokesOnlyCommandRule(),
      new EventNodeCommandRule(),
      new VisibleWithoutScreenRule(),
      new ScreenUsesHiddenRule(),
      new FilledTextsRule(),
      new SchemaFieldTextsRule(),
      new CatchesOfUcRule(),
      new PrimaryActionRule(),
      new RefreshRecordRule(),
      new RecipientFieldsRule(),
      new StrictParamsRule(),
      new ExamplesBySchemaRule(this.set),
      new LocalActionNamesRule(),
      new OrphanReferenceRule(),
      new StoryFormRule(),
      new StoryLeadsRule(),
      new ExitTargetsRule(),
      new SensitiveExamplesRule(),
      new UnsupportedFieldKindRule(),
    ];
  }
}
