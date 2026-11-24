import type { PageInboxEntry, ViewSource } from 'dmg-ui/web-ui';
import type { AppExampleViews } from '../view/app-example-views';
import type { ExampleGestures } from '../view/example-gestures';
import { InboxModel } from '../view/inbox-model';
import type { InboxItem } from '../view/inbox-model.types';
import { CLIENT_TEXTS } from './client-texts.const';
import { h } from './dom-element';

/** Блок «Входящие»: текст записи и кнопки «Открыть» по её ссылкам. */
export class InboxDom {
  constructor(
    private readonly views: Pick<AppExampleViews, 'findNotification'>,
    private readonly gestures: ExampleGestures,
  ) {}

  show(
    source: ViewSource<readonly PageInboxEntry[]>,
    target: HTMLElement,
  ): () => void {
    return source.subscribe((entries) => {
      const items = InboxModel.of(entries, this.views);
      target.replaceChildren(
        h('h2', { text: CLIENT_TEXTS.inbox }),
        items.length === 0
          ? h('p', { class: 'placeholder', text: CLIENT_TEXTS.inboxEmpty })
          : h(
              'ul',
              { class: 'inbox-items' },
              items.map((item) => this.item(item)),
            ),
      );
    });
  }

  private item(item: InboxItem): HTMLElement {
    return h('li', { class: 'inbox-item' }, [
      h('span', { text: item.text }),
      ...item.links.map((link) =>
        h('button', {
          type: 'button',
          text: CLIENT_TEXTS.open,
          click: () => {
            void this.gestures.openLink(link);
          },
        }),
      ),
    ]);
  }
}
