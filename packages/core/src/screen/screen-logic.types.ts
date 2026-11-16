import type {
  AnyScreenDef,
  DataOf,
  StateOf,
} from '../manifest/screen-def.types';

/** Функция локального действия со входом, уже проверенным схемой. */
export type CheckedLocalFn<D extends AnyScreenDef> = (
  state: StateOf<D>,
  data: DataOf<D>,
  input: unknown,
) => unknown;

/** Имя действия экрана — ключ `actions` манифеста. */
export type ActionName<D extends AnyScreenDef> = keyof D['actions'] & string;

/** Имя локального действия экрана — ключ `locals` манифеста. */
export type LocalName<D extends AnyScreenDef> = keyof D['locals'] & string;
