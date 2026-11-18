import { err, ok, type Result } from 'dmg-core';
import * as v from 'valibot';
import { PageId } from '../wire/page-messages';
import type {
  PageAdmission,
  PageGateRefusal,
  PageGateSpec,
  PageHeaders,
} from './page-server.types';

/**
 * Ворота страничного канала до открытия соединения (D-UI-72): источник
 * запроса — по белому списку, пропуск — из cookie. Синхронно и без лога:
 * отказ значений не несёт, привязка отвечает на него `403`. Неизвестный
 * токен отказывает уже `PageHost.connect`.
 * @see ./page-gate.test.ts
 */
export class PageGate {
  /**
   * Пустой список источников, `'null'` или источник не в канонической форме —
   * ошибка сборки, бросок: такой элемент не совпал бы с `Origin` браузера или
   * пропустил бы чужой.
   */
  constructor(private readonly spec: PageGateSpec) {
    if (spec.origins.length === 0) {
      throw new Error('PageGate: список разрешённых источников пуст');
    }
    for (const origin of spec.origins) {
      if (!PageGate.canonical(origin)) {
        throw new Error(
          `PageGate: источник ${JSON.stringify(origin)} не в канонической форме схема://хост[:порт]`,
        );
      }
    }
  }

  /**
   * Источник проверяется первым: точное совпадение строки `Origin` с
   * элементом списка; нет заголовка или `null` — `origin`. Затем пропуск —
   * `token`, если его нет или он не годен.
   */
  admit(headers: PageHeaders): Result<PageAdmission, PageGateRefusal> {
    const origin = headers.get('origin');
    // `null` шлёт страница без источника (песочница, файл): не наша.
    if (origin === null || origin === 'null') return err('origin');
    if (!this.spec.origins.includes(origin)) return err('origin');
    const token = PageGate.cookie(headers.get('cookie'), this.spec.cookie);
    return token === undefined ? err('token') : ok({ token });
  }

  /**
   * Источник совпадает со своей канонической формой: схема и хост в нижнем
   * регистре, без пути и косой черты, стандартный порт не указан. `'null'` и
   * не адрес — нет.
   */
  private static canonical(origin: string): boolean {
    if (origin === 'null') return false;
    try {
      return new URL(origin).origin === origin;
    } catch {
      return false;
    }
  }

  /**
   * Значение cookie `name`: ровно одно вхождение имени и значение по
   * `PageId`, иначе `undefined`. Повтор отвергается: какое из двух значений
   * верное, по заголовку не узнать.
   */
  private static cookie(
    header: string | null,
    name: string,
  ): string | undefined {
    if (header === null) return undefined;
    const prefix = `${name}=`;
    const values = header
      .split(';')
      .map((pair) => pair.trim())
      .filter((pair) => pair.startsWith(prefix))
      .map((pair) => pair.slice(prefix.length));
    if (values.length !== 1) return undefined;
    const [value] = values;
    return v.is(PageId, value) ? value : undefined;
  }
}
