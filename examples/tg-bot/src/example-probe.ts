import {
  type FormattedText,
  LimitedMessenger,
  type Message,
  type MessageHandle,
  type MessageOption,
  type Moment,
  type MomentShow,
  TextBuilder,
  type TextFragment,
} from 'dmg-ui/chat-ui';
import { TelegramMessenger } from 'dmg-ui/tg-bot';
import { EXAMPLE_MOMENT } from 'dmg-ui/tg-bot/testing';
import { PROBE_CASES } from './example-probe.const';
import type {
  ExampleProbeSpec,
  ProbeCase,
  ProbeResult,
} from './example-probe.types';

/** Ссылка пробы: пример не обращается по ней в сеть. */
const LINK = 'https://example.org';

/**
 * Проба Bot API (D-UI-68): набор сообщений в чат человека через настоящий
 * `TelegramMessenger` под стражем лимитов; первая строка каждого — что смотреть.
 * Ничего не опрашивает: нажатия в пробе не обрабатываются. Порядок проб —
 * порядок `PROBE_CASES`.
 */
export class ExampleProbe {
  private readonly messenger: LimitedMessenger;
  private readonly peer: string;
  /** Показанное сообщение пробы «ушедший экран»: нужно для `retire`. */
  private shown: { handle: MessageHandle; message: Message } | undefined;
  private readonly runners: readonly (() => Promise<ProbeResult>)[];

  constructor(private readonly spec: ExampleProbeSpec) {
    this.messenger = new LimitedMessenger({
      port: new TelegramMessenger({ api: spec.api, logger: spec.logger }),
      logger: spec.logger,
    });
    this.peer = String(spec.chat);
    this.runners = [
      () => this.styles(),
      () => this.linkOverCode(),
      () => this.codeBlocks(),
      () => this.codeInQuote(),
      () => this.moments(),
      () => this.emoji(),
      () => this.retiring(),
      () => this.labels(),
      () => this.buttons(),
      () => this.emptyKeyboard(),
      () => this.spaces(),
      () => this.sameContent(),
      () => this.lengths(),
    ];
  }

  /** Одна проба по id; неизвестный id — бросок. */
  async run(id: string): Promise<ProbeResult> {
    const index = PROBE_CASES.findIndex((probeCase) => probeCase.id === id);
    const runner = this.runners[index];
    if (runner === undefined) throw new Error(`нет пробы ${id}`);
    return runner();
  }

  /** Весь набор по порядку. */
  async runAll(): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];
    for (const probeCase of PROBE_CASES) {
      results.push(await this.run(probeCase.id));
    }
    return results;
  }

  /** Убирает варианты показанного сообщения пробы «ушедший экран» (Е7): остаётся серая кнопка с подписью выбранного. */
  async retire(id: string): Promise<ProbeResult> {
    const probeCase = ExampleProbe.caseOf(id);
    const shown = id === ExampleProbe.RETIRING ? this.shown : undefined;
    if (shown === undefined) {
      this.spec.logger.warn('ExampleProbe', 'нечего убирать');
      return { id: probeCase.id, sent: 0, failed: 1 };
    }
    const outcome = await this.messenger.retire(
      this.peer,
      shown.handle,
      shown.message,
      shown.message.options[0]?.ref,
    );
    return {
      id: probeCase.id,
      sent: outcome.ok ? 1 : 0,
      failed: outcome.ok ? 0 : 1,
    };
  }

  private static get RETIRING(): string {
    return PROBE_CASES[6]?.id ?? '';
  }

  private static caseOf(id: string): ProbeCase {
    const found = PROBE_CASES.find((probeCase) => probeCase.id === id);
    if (found === undefined) throw new Error(`нет пробы ${id}`);
    return found;
  }

  /** Сообщение пробы: первая строка — id и «что смотреть», дальше образец. */
  private static message(
    index: number,
    body: FormattedText,
    options: readonly MessageOption[] = [],
  ): Message {
    const probeCase = PROBE_CASES[index];
    const head = `${probeCase?.id}. ${probeCase?.look}\n`;
    return { kind: 'text', text: [...TextBuilder.of(head), ...body], options };
  }

  private static option(ref: string, label: string): MessageOption {
    return { ref, label };
  }

  private static fragment(
    text: string,
    extra: Partial<TextFragment> = {},
  ): TextFragment {
    return { text, styles: [], ...extra };
  }

  private static moment(show: MomentShow): Moment {
    return { at: EXAMPLE_MOMENT.at, show };
  }

  /** Показ набора сообщений: итог по доставке каждого. */
  private async shows(
    index: number,
    messages: readonly Message[],
  ): Promise<ProbeResult> {
    let sent = 0;
    let failed = 0;
    for (const message of messages) {
      const outcome = await this.messenger.show(this.peer, message);
      if (outcome.ok) {
        sent += 1;
        if (index === 6) this.shown = { handle: outcome.value, message };
      } else {
        failed += 1;
      }
    }
    return { id: PROBE_CASES[index]?.id ?? '', sent, failed };
  }

  private styles(): Promise<ProbeResult> {
    const body = new TextBuilder()
      .bold('жирный')
      .text(' ')
      .italic('курсив')
      .text(' ')
      .strike('зачёркнутый')
      .text(' ')
      .code('код')
      .codeBlock('блок кода\nв две строки')
      .quote('цитата')
      .build();
    return this.shows(0, [ExampleProbe.message(0, body)]);
  }

  private linkOverCode(): Promise<ProbeResult> {
    const body = [
      ExampleProbe.fragment('текст '),
      ExampleProbe.fragment('ссылка поверх кода', {
        styles: ['code'],
        link: LINK,
      }),
      ExampleProbe.fragment(' и снова текст'),
    ];
    return this.shows(1, [ExampleProbe.message(1, body)]);
  }

  private codeBlocks(): Promise<ProbeResult> {
    const body = [
      ExampleProbe.fragment('первый блок\n', { styles: ['codeBlock'] }),
      ExampleProbe.fragment('второй блок', { styles: ['codeBlock'] }),
    ];
    return this.shows(2, [ExampleProbe.message(2, body)]);
  }

  private codeInQuote(): Promise<ProbeResult> {
    const body = new TextBuilder()
      .quote((inner) => inner.text('цитата с ').code('кодом').text(' внутри'))
      .build();
    return this.shows(3, [ExampleProbe.message(3, body)]);
  }

  private moments(): Promise<ProbeResult> {
    const shows: MomentShow[] = ['relative', 'dateTime', 'date', 'time'];
    const plain = shows.flatMap((show) => [
      ExampleProbe.fragment(`${show}: `),
      ExampleProbe.fragment('дата', { moment: ExampleProbe.moment(show) }),
      ExampleProbe.fragment('\n'),
    ]);
    const mixed: TextFragment[] = [
      ExampleProbe.fragment('жирный: '),
      ExampleProbe.fragment('дата', {
        styles: ['bold'],
        moment: ExampleProbe.moment('dateTime'),
      }),
      ExampleProbe.fragment('\nссылка: '),
      ExampleProbe.fragment('дата', {
        link: LINK,
        moment: ExampleProbe.moment('dateTime'),
      }),
      ExampleProbe.fragment('\nкод: '),
      ExampleProbe.fragment('дата', {
        styles: ['code'],
        moment: ExampleProbe.moment('dateTime'),
      }),
      ExampleProbe.fragment('\n'),
      ExampleProbe.fragment('цитата: дата', {
        styles: ['quote'],
        moment: ExampleProbe.moment('dateTime'),
      }),
    ];
    return this.shows(4, [
      ExampleProbe.message(4, plain),
      ExampleProbe.message(4, mixed),
    ]);
  }

  private emoji(): Promise<ProbeResult> {
    const body = new TextBuilder()
      .text('👨‍👩‍👧 ')
      .bold('жирный после семьи')
      .text('\n🇰🇿 ')
      .italic('курсив после флага')
      .text('\n1️⃣ ')
      .code('код после цифры')
      .build();
    return this.shows(5, [ExampleProbe.message(5, body)]);
  }

  private retiring(): Promise<ProbeResult> {
    const body = TextBuilder.of('Нажми Enter в консоли: кнопки уйдут.');
    return this.shows(6, [
      ExampleProbe.message(6, body, [
        ExampleProbe.option('r1', 'Выбранный вариант'),
        ExampleProbe.option('r2', 'Другой вариант'),
      ]),
    ]);
  }

  private labels(): Promise<ProbeResult> {
    const cyrillic = (length: number) => 'ж'.repeat(length);
    const body = TextBuilder.of('Подписи: 64 и 65 знаков, с эмодзи.');
    return this.shows(7, [
      ExampleProbe.message(7, body, [
        ExampleProbe.option('l1', cyrillic(64)),
        ExampleProbe.option('l2', cyrillic(65)),
        ExampleProbe.option('l3', `${cyrillic(62)}😀`),
        ExampleProbe.option('l4', `${cyrillic(63)}😀`),
      ]),
    ]);
  }

  private buttons(): Promise<ProbeResult> {
    const options = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        ExampleProbe.option(`b${index + 1}`, String(index + 1)),
      );
    return this.shows(8, [
      ExampleProbe.message(8, TextBuilder.of('Сто кнопок.'), options(100)),
      ExampleProbe.message(8, TextBuilder.of('Сто одна кнопка.'), options(101)),
    ]);
  }

  private async emptyKeyboard(): Promise<ProbeResult> {
    const options = [ExampleProbe.option('k1', 'Кнопка исчезнет')];
    const before = ExampleProbe.message(
      9,
      TextBuilder.of('До правки.'),
      options,
    );
    const after = ExampleProbe.message(
      9,
      TextBuilder.of('После правки: кнопок нет.'),
    );
    const shown = await this.messenger.show(this.peer, before);
    if (!shown.ok) return { id: PROBE_CASES[9]?.id ?? '', sent: 0, failed: 1 };
    const edited = await this.messenger.update(this.peer, shown.value, after);
    return {
      id: PROBE_CASES[9]?.id ?? '',
      sent: edited.ok ? 2 : 1,
      failed: edited.ok ? 0 : 1,
    };
  }

  private spaces(): Promise<ProbeResult> {
    const trailing = [
      ExampleProbe.fragment('хвост:'),
      ExampleProbe.fragment('  жирный с пробелами  ', { styles: ['bold'] }),
    ];
    const leading = ExampleProbe.message(10, [
      ExampleProbe.fragment('Пробелы в начале: '),
      ExampleProbe.fragment('   курсив   ', { styles: ['italic'] }),
      ExampleProbe.fragment(' конец'),
    ]);
    return this.shows(10, [ExampleProbe.message(10, trailing), leading]);
  }

  private async sameContent(): Promise<ProbeResult> {
    const message = ExampleProbe.message(
      11,
      TextBuilder.of('Правка тем же содержимым.'),
    );
    const shown = await this.messenger.show(this.peer, message);
    if (!shown.ok) return { id: PROBE_CASES[11]?.id ?? '', sent: 0, failed: 1 };
    const edited = await this.messenger.update(this.peer, shown.value, message);
    return {
      id: PROBE_CASES[11]?.id ?? '',
      sent: edited.ok ? 2 : 1,
      failed: edited.ok ? 0 : 1,
    };
  }

  private lengths(): Promise<ProbeResult> {
    const head = ExampleProbe.message(12, []);
    const headLength = head.text
      .map((fragment) => fragment.text)
      .join('').length;
    const filled = (total: number) =>
      ExampleProbe.message(12, [
        ExampleProbe.fragment('я'.repeat(total - headLength)),
      ]);
    return this.shows(12, [filled(4096), filled(4097)]);
  }
}
