import type { AnyModuleDef, AnyUseCaseDef } from 'dmg-core';
import { DefIndex, GraphId } from 'dmg-core/graph';
import type { AnyUiAppDef } from 'dmg-ui';
import type {
  ChatCommunitySpec,
  ChatReactionSpec,
  ChatSignalSpec,
} from './community.types';

/**
 * Манифесты сообщества приложения, проверенные при сборке (D-UI-60): одна
 * проверка для поставщика графа и исполнителя. Бросок — имя повторено или не
 * сегмент `GraphId`, UC или событие вне модулей приложения, пустые `input`
 * или поле `targets`; текст — имена приложения, манифеста и Def, без значений.
 */
export class CommunityManifest {
  readonly signals: readonly ChatSignalSpec[];
  readonly reactions: readonly ChatReactionSpec[];
  private readonly app: AnyUiAppDef;
  private readonly index: DefIndex;

  constructor(app: AnyUiAppDef, community: ChatCommunitySpec) {
    this.app = app;
    this.index = DefIndex.from(app.set.app.modules);
    this.signals = community.signals ?? [];
    this.reactions = community.reactions ?? [];
    this.names('сигнал', this.signals);
    this.names('реакция', this.reactions);
    for (const signal of this.signals) this.signal(signal);
    for (const reaction of this.reactions) this.reaction(reaction);
  }

  /** Имена манифестов одного вида — без повторов и сегменты `GraphId`. */
  private names(
    what: 'сигнал' | 'реакция',
    specs: readonly { readonly name: string }[],
  ): void {
    const seen = new Set<string>();
    for (const { name } of specs) {
      if (!GraphId.isSegment(name)) {
        this.fail(`${what} ${name}: имя не по правилу сегмента id графа`);
      }
      if (seen.has(name)) this.fail(`${what} ${name}: имя повторено`);
      seen.add(name);
    }
  }

  private signal({ name, uc, input }: ChatSignalSpec): void {
    if (this.index.moduleOf(uc) === undefined) {
      this.fail(`сигнал ${name}: UC ${uc.name} вне приложения`);
    }
    if (CommunityManifest.blank(input)) {
      this.fail(`сигнал ${name}: пустой input`);
    }
  }

  private reaction({
    name,
    uc,
    event,
    input,
    targets,
  }: ChatReactionSpec): void {
    if (this.index.moduleOf(uc) === undefined) {
      this.fail(`реакция ${name}: UC ${uc.name} вне приложения`);
    }
    if (this.index.aggregateOf(event) === undefined) {
      this.fail(`реакция ${name}: событие ${event.name} вне приложения`);
    }
    if (CommunityManifest.blank(input)) {
      this.fail(`реакция ${name}: пустой input`);
    }
    if (targets.community === '' || targets.person === '') {
      this.fail(`реакция ${name}: пустое поле targets`);
    }
  }

  /** Модуль-владелец UC манифеста: конструктор уже проверил, что он есть. */
  moduleOf(uc: AnyUseCaseDef): AnyModuleDef {
    const module = this.index.moduleOf(uc);
    if (module === undefined) this.fail(`UC ${uc.name} вне приложения`);
    return module;
  }

  /** Бросок сборки сообщества приложения: префикс — в одном месте. */
  fail(text: string): never {
    throw new Error(`сообщество приложения ${this.app.name}: ${text}`);
  }

  /** Нет полей или есть поле с пустым именем либо значением. */
  private static blank(input: Readonly<Record<string, string>>): boolean {
    const entries = Object.entries(input);
    return (
      entries.length === 0 ||
      entries.some(([field, from]) => field === '' || from === '')
    );
  }
}
