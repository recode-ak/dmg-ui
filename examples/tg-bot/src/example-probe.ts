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
import { PROBE_CASES, RETIRING_PROBE } from './example-probe.const';
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
  private readonly runners: ReadonlyMap<string, () => Promise<ProbeResult>>;

  constructor(private readonly spec: ExampleProbeSpec) {
    this.messenger = new LimitedMessenger({
      port: new TelegramMessenger({ api: spec.api, logger: spec.logger }),
      logger: spec.logger,
    });
    this.peer = String(spec.chat);
    this.runners = new Map<string, () => Promise<ProbeResult>>([
      ['Е1', () => this.styles()],
      ['Е2', () => this.linkOverCode()],
      ['Е3', () => this.codeBlocks()],
      ['Е4', () => this.codeInQuote()],
      ['Е5', () => this.moments()],
      ['Е6', () => this.emoji()],
      ['Е7', () => this.retiring()],
      ['Е8', () => this.labels()],
      ['Е9', () => this.buttons()],
      ['Е10', () => this.emptyKeyboard()],
      ['Е11', () => this.spaces()],
      ['Е12', () => this.sameContent()],
      ['Е13', () => this.lengths()],
    ]);
  }

  /** Одна проба по id; неизвестный id — бросок. */
  async run(id: string): Promise<ProbeResult> {
    const runner = this.runners.get(id);
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

  /** Убирает варианты показанного сообщения пробы «ушедший экран» (Е7): текст остаётся со строкой «Вы выбрали: <подпись>», клавиатура снята. */
  async retire(id: string): Promise<ProbeResult> {
    const probeCase = ExampleProbe.caseOf(id);
    const shown = id === RETIRING_PROBE ? this.shown : undefined;
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

  private static caseOf(id: string): ProbeCase {
    const found = PROBE_CASES.find((probeCase) => probeCase.id === id);
    if (found === undefined) throw new Error(`нет пробы ${id}`);
    return found;
  }

  /** Сообщение пробы: первая строка — id и «что смотреть», дальше образец. */
  private static message(
    id: string,
    body: FormattedText,
    options: readonly MessageOption[] = [],
  ): Message {
    const probeCase = ExampleProbe.caseOf(id);
    const head = `${probeCase.id}. ${probeCase.look}\n`;
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
    id: string,
    messages: readonly Message[],
  ): Promise<ProbeResult> {
    let sent = 0;
    let failed = 0;
    for (const message of messages) {
      const outcome = await this.messenger.show(this.peer, message);
      if (outcome.ok) {
        sent += 1;
        if (id === RETIRING_PROBE)
          this.shown = { handle: outcome.value, message };
      } else {
        failed += 1;
      }
    }
    return { id, sent, failed };
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
    return this.shows('Е1', [ExampleProbe.message('Е1', body)]);
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
    return this.shows('Е2', [ExampleProbe.message('Е2', body)]);
  }

  private codeBlocks(): Promise<ProbeResult> {
    const body = [
      ExampleProbe.fragment('первый блок\n', { styles: ['codeBlock'] }),
      ExampleProbe.fragment('второй блок', { styles: ['codeBlock'] }),
    ];
    return this.shows('Е3', [ExampleProbe.message('Е3', body)]);
  }

  private codeInQuote(): Promise<ProbeResult> {
    const body = new TextBuilder()
      .quote((inner) => inner.text('цитата с ').code('кодом').text(' внутри'))
      .build();
    return this.shows('Е4', [ExampleProbe.message('Е4', body)]);
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
    return this.shows('Е5', [
      ExampleProbe.message('Е5', plain),
      ExampleProbe.message('Е5', mixed),
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
    return this.shows('Е6', [ExampleProbe.message('Е6', body)]);
  }

  private retiring(): Promise<ProbeResult> {
    const body = TextBuilder.of('Нажми Enter в консоли: кнопки уйдут.');
    return this.shows('Е7', [
      ExampleProbe.message('Е7', body, [
        ExampleProbe.option('r1', 'Выбранный вариант'),
        ExampleProbe.option('r2', 'Другой вариант'),
      ]),
    ]);
  }

  private labels(): Promise<ProbeResult> {
    const cyrillic = (length: number) => 'ж'.repeat(length);
    const body = TextBuilder.of('Подписи: 64 и 65 знаков, с эмодзи.');
    return this.shows('Е8', [
      ExampleProbe.message('Е8', body, [
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
    return this.shows('Е9', [
      ExampleProbe.message('Е9', TextBuilder.of('Сто кнопок.'), options(100)),
      ExampleProbe.message(
        'Е9',
        TextBuilder.of('Сто одна кнопка.'),
        options(101),
      ),
    ]);
  }

  private async emptyKeyboard(): Promise<ProbeResult> {
    const options = [ExampleProbe.option('k1', 'Кнопка исчезнет')];
    const before = ExampleProbe.message(
      'Е10',
      TextBuilder.of('До правки.'),
      options,
    );
    const after = ExampleProbe.message(
      'Е10',
      TextBuilder.of('После правки: кнопок нет.'),
    );
    const shown = await this.messenger.show(this.peer, before);
    if (!shown.ok) return { id: 'Е10', sent: 0, failed: 1 };
    const edited = await this.messenger.update(this.peer, shown.value, after);
    return {
      id: 'Е10',
      sent: edited.ok ? 2 : 1,
      failed: edited.ok ? 0 : 1,
    };
  }

  private spaces(): Promise<ProbeResult> {
    const trailing = [
      ExampleProbe.fragment('хвост:'),
      ExampleProbe.fragment('  жирный с пробелами  ', { styles: ['bold'] }),
    ];
    const leading = ExampleProbe.message('Е11', [
      ExampleProbe.fragment('Пробелы в начале: '),
      ExampleProbe.fragment('   курсив   ', { styles: ['italic'] }),
      ExampleProbe.fragment(' конец'),
    ]);
    return this.shows('Е11', [ExampleProbe.message('Е11', trailing), leading]);
  }

  private async sameContent(): Promise<ProbeResult> {
    const message = ExampleProbe.message(
      'Е12',
      TextBuilder.of('Правка тем же содержимым.'),
    );
    const shown = await this.messenger.show(this.peer, message);
    if (!shown.ok) return { id: 'Е12', sent: 0, failed: 1 };
    const edited = await this.messenger.update(this.peer, shown.value, message);
    return {
      id: 'Е12',
      sent: edited.ok ? 2 : 1,
      failed: edited.ok ? 0 : 1,
    };
  }

  private lengths(): Promise<ProbeResult> {
    const head = ExampleProbe.message('Е13', []);
    const headLength = head.text
      .map((fragment) => fragment.text)
      .join('').length;
    const filled = (total: number) =>
      ExampleProbe.message('Е13', [
        ExampleProbe.fragment('я'.repeat(total - headLength)),
      ]);
    return this.shows('Е13', [filled(4096), filled(4097)]);
  }
}
