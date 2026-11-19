import type { AddressJson } from 'dmg-ui';
import type { PageStepPlace } from './page-history.types';

/**
 * Ключ места корневой области по правилу шага приложения (D-UI-104) или по
 * экрану адреса (D-UI-97). Бросок правила — ключ по умолчанию; `onFault` —
 * один раз на экземпляр, на первом броске: `place()` зовётся на каждое
 * изменение, а бросок может нести параметры людей — наружу только факт.
 * @see ./page-step-key.test.ts
 */
export class PageStepKey {
  private constructor(
    private readonly rule: PageStepPlace | undefined,
    private readonly onFault: () => void,
  ) {}

  /** Сбой правила уже отдан в `onFault`. */
  private faulted = false;

  static of(rule: PageStepPlace | undefined, onFault: () => void): PageStepKey {
    return new PageStepKey(rule, onFault);
  }

  /** Ключ места по адресу корня. */
  key(address: AddressJson): string {
    if (this.rule === undefined) return address.screen;
    try {
      return this.rule(address);
    } catch {
      if (!this.faulted) {
        this.faulted = true;
        this.onFault();
      }
      return address.screen;
    }
  }
}
