import { TextBuilder } from '../../message/text-builder';
import type {
  LimitCut,
  MessengerCapabilities,
} from '../../messenger/messenger.types';
import { ExampleFit } from './example-fit';
import { STUB_REF } from './example-limits.const';
import type { NoticeLink } from './example-limits.types';

/**
 * Мера уведомления для CH-01 — как его строит беседа (`notice`): текст
 * представления строкой, по варианту на ссылку с подписью экрана-цели.
 * Без ссылок текст меряется по `text`, со ссылками — по `textWithOptions`;
 * ссылки беседа не раскладывает — их число меряется по `options.max`.
 */
export class NotificationLimits {
  private readonly fit: ExampleFit;

  constructor(capabilities: MessengerCapabilities) {
    this.fit = ExampleFit.notice(capabilities);
  }

  /** Нарушения текста уведомления со ссылками — без текста и данных. */
  check(text: string, links: readonly NoticeLink[]): string[] {
    return this.fit
      .cuts({
        kind: 'text',
        text: TextBuilder.of(text),
        options: links.map(({ label }) => ({ ref: STUB_REF, label })),
      })
      .flatMap((cut) => NotificationLimits.line(cut, links));
  }

  /** Строка разреза; подпись — по ссылке с номером варианта. */
  private static line(cut: LimitCut, links: readonly NoticeLink[]): string[] {
    switch (cut.limit) {
      case 'text':
      case 'textWithOptions':
      case 'pressAnswer':
        return [`текст длиннее лимита ${cut.limit} ${ExampleFit.measure(cut)}`];
      case 'label': {
        const link = links[cut.index ?? 0];
        const target = link === undefined ? '' : ` на ${link.screen}`;
        return [
          `ссылка${target}: подпись длиннее лимита ${ExampleFit.measure(cut)}`,
        ];
      }
      case 'options':
        return [`ссылок больше лимита ${ExampleFit.measure(cut)}`];
      default: {
        const unknownLimit: never = cut.limit;
        throw new Error(
          `NotificationLimits: неизвестный лимит ${unknownLimit}`,
        );
      }
    }
  }
}
