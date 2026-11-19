import { ATTRIBUTE_KEY } from './dom-element.const';
import type {
  ElementChildren,
  ElementProps,
  ElementTag,
} from './dom-element.types';

/**
 * Единственное место, где создаются элементы страницы. Текст — только
 * `textContent`, значение — свойство `value`; разметка не разбирается, имена
 * атрибутов — из белого списка свойств.
 */
export const h = <K extends ElementTag>(
  tag: K,
  props: ElementProps = {},
  children: ElementChildren = [],
): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (props.class !== undefined) element.className = props.class;
  if (props.type !== undefined) element.setAttribute('type', props.type);
  if (props.id !== undefined) element.setAttribute('id', props.id);
  if (props.name !== undefined) element.setAttribute('name', props.name);
  if (props.title !== undefined) element.setAttribute('title', props.title);
  if (props.min !== undefined) element.setAttribute('min', String(props.min));
  if (props.max !== undefined) element.setAttribute('max', String(props.max));
  if (props.step !== undefined) {
    element.setAttribute('step', String(props.step));
  }
  if (props.novalidate === true) element.setAttribute('novalidate', '');
  if (props.disabled === true) element.setAttribute('disabled', '');
  if (props.draggable !== undefined) {
    element.setAttribute('draggable', String(props.draggable));
  }
  if (props.tabindex !== undefined) {
    element.setAttribute('tabindex', String(props.tabindex));
  }
  prefixed(element, 'aria-', props.aria);
  prefixed(element, 'data-', props.data);
  if (props.text !== undefined) element.textContent = props.text;
  for (const child of children) {
    if (child !== undefined) element.append(child);
  }
  // Значение и отметка — после детей: `select` берёт значение среди `option`.
  if (props.value !== undefined) setValue(element, props.value);
  if (props.checked !== undefined && element instanceof HTMLInputElement) {
    element.checked = props.checked;
  }
  const click = props.click;
  if (click !== undefined) element.addEventListener('click', click);
  return element;
};

const prefixed = (
  element: HTMLElement,
  prefix: string,
  values: Readonly<Record<string, string>> | undefined,
): void => {
  if (values === undefined) return;
  for (const [key, value] of Object.entries(values)) {
    if (!ATTRIBUTE_KEY.test(key)) {
      throw new Error(`h: недопустимое имя атрибута ${prefix}${key}`);
    }
    element.setAttribute(`${prefix}${key}`, value);
  }
};

const setValue = (element: HTMLElement, value: string): void => {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLOptionElement
  ) {
    element.value = value;
  }
};
