import type { LinkFacts } from './link-click.types';

/** Без `target` или в этом же окне. */
const own = (target: string | undefined): boolean =>
  target === undefined || target === '' || target === '_self';

/**
 * Решение по щелчку на ссылке внутри страницы: путь с запросом — переход
 * внутри страницы; `undefined` — оставить браузеру (новая вкладка и окно,
 * чужой источник, не `http(s)`, якорь, уже отменённое событие). Объект, а не
 * класс: преобразование без состояния (biome `noStaticOnlyClass`).
 */
export const LinkClick = {
  target(facts: LinkFacts, origin: string): string | undefined {
    if (facts.defaultPrevented || facts.download) return undefined;
    if (facts.button !== 0) return undefined;
    if (facts.ctrlKey || facts.metaKey || facts.shiftKey || facts.altKey) {
      return undefined;
    }
    if (!own(facts.target)) return undefined;
    const href = facts.href;
    if (href === undefined || href === '' || href.startsWith('#')) {
      return undefined;
    }
    try {
      const url = new URL(href, origin);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return undefined;
      }
      if (url.origin !== new URL(origin).origin) return undefined;
      return `${url.pathname}${url.search}`;
    } catch {
      return undefined;
    }
  },
} as const;
