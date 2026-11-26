import type { Trace } from 'dmg-core';
import type { AddressCodec, AddressJson } from 'dmg-ui';
import { CONVERSATION_TEXTS } from './conversation.const';
import type {
  ConversationLinks,
  LinkOperation,
  LinkRejection,
} from './conversation.types';
import type { ConversationLog } from './conversation-log';
import type { ConversationOutput } from './conversation-output';
import type { ConversationScreens } from './conversation-screens';
import { LinkCodes } from './link-codes';

/** Части беседы, на которых работают ссылки на экран. */
type LinksParts = {
  /** Хранилище и URL проекта; нет — ссылки не выдаются, код не читается. */
  readonly links?: ConversationLinks;
  readonly screens: ConversationScreens;
  readonly output: ConversationOutput;
  readonly log: ConversationLog;
  readonly codec: AddressCodec;
};

/** Адрес из хранилища по коду; отказ — причина. */
type Found =
  | { readonly ok: true; readonly address: unknown }
  | { readonly ok: false; readonly reason: LinkRejection };

/**
 * Ссылки на экран беседы (D-UI-127): выдача по `/link` — код адреса живого
 * экрана (`LinkCodes`) в хранилище проекта и заметка с URL; вход по коду
 * (`enter.param`) и по адресу проекта (сигнал `open`) — экран как вход, путь
 * сброшен, от имени открывшего. Код и адрес — внешние данные: отказ —
 * заметка, не бросок (ERR-01); в лог — ни кода, ни адреса (ERR-07).
 *
 * @see conversation-links.test.ts
 */
export class ScreenLinks {
  constructor(private readonly parts: LinksParts) {}

  /**
   * `/link`: в ссылку идёт только адрес живого экрана — ни состояния, ни
   * пути. Под кодом тот же адрес — та же ссылка; другой (коллизия) — отказ
   * без перезаписи; записи нет — `put`. Экземпляр, путь, черновик и таблица
   * ссылок не трогаются.
   */
  async issue(): Promise<void> {
    const { links, screens, output } = this.parts;
    if (links === undefined) {
      await output.note(CONVERSATION_TEXTS.noLinks);
      return;
    }
    const live = screens.current();
    if (live === undefined) {
      await output.note(CONVERSATION_TEXTS.noLinkScreen);
      return;
    }
    const address = live.instance.snapshot().address;
    const url = await this.url(links, address);
    if (url === undefined) {
      await output.note(CONVERSATION_TEXTS.linkFailed);
      return;
    }
    this.parts.log.linkIssued();
    await output.note(`${CONVERSATION_TEXTS.link}\n${url}`);
  }

  /**
   * Код из `enter.param`: экран по адресу из хранилища — как вход, `true`.
   * Нет `links` или параметра (пустой — как нет) — `false` без заметки;
   * отказ — заметка «Ссылка не найдена.» и `false`: вход сигнала исполняет
   * вызывающий.
   */
  async enter(param: string | undefined, trace: Trace): Promise<boolean> {
    const { links } = this.parts;
    if (links === undefined || param === undefined || param === '') {
      return false;
    }
    const found = await this.find(links, param);
    const address = found.ok
      ? this.parts.codec.decode(found.address)
      : undefined;
    if (address === undefined || !address.ok) {
      this.parts.log.linkRejected('enter', found.ok ? 'address' : found.reason);
      await this.parts.output.note(CONVERSATION_TEXTS.linkNotFound);
      return false;
    }
    await this.parts.screens.enter(address.value, trace);
    this.parts.log.linkOpened('enter');
    return true;
  }

  /** Сигнал `open`: адрес проекта — как вход; не декодировался — заметка «Ссылка не найдена.» и вход home. */
  async open(json: AddressJson, trace: Trace): Promise<void> {
    const { codec, screens, output, log } = this.parts;
    const address = codec.decode(json);
    if (!address.ok) {
      log.linkRejected('open', 'address');
      await output.note(CONVERSATION_TEXTS.linkNotFound);
      await screens.home(trace);
      return;
    }
    await screens.enter(address.value, trace);
    log.linkOpened('open');
  }

  /** Адрес кода в хранилище; в порт идёт только код по формату. */
  private async find(links: ConversationLinks, code: string): Promise<Found> {
    if (!LinkCodes.fits(code)) return { ok: false, reason: 'format' };
    let address: unknown;
    try {
      address = await links.store.get(code);
    } catch (error) {
      this.parts.log.linkFailed('get', error);
      return { ok: false, reason: 'port' };
    }
    return address === undefined
      ? { ok: false, reason: 'unknown' }
      : { ok: true, address };
  }

  /**
   * URL ссылки на адрес: запись есть или положена; коллизия и сбой (код, порт,
   * URL проекта) — `undefined` и запись лога, не бросок (ERR-01).
   */
  private async url(
    links: ConversationLinks,
    address: AddressJson,
  ): Promise<string | undefined> {
    let operation: LinkOperation = 'code';
    try {
      const code = await LinkCodes.of(address);
      operation = 'get';
      const stored: unknown = await links.store.get(code);
      if (stored === undefined) {
        operation = 'put';
        await links.store.put(code, address);
      } else if (LinkCodes.canonical(stored) !== LinkCodes.canonical(address)) {
        this.parts.log.linkCollision();
        return undefined;
      }
      operation = 'url';
      return links.url(code);
    } catch (error) {
      this.parts.log.linkFailed(operation, error);
      return undefined;
    }
  }
}
