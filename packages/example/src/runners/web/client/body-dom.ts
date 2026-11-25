import type {
  ActionModel,
  CardBody,
  FieldModel,
  FormModel,
  RegionModel,
  TaskRowModel,
} from '../../../frontend/web-kit/region-model.types';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { ControlIds } from '../view/control-ids';
import type { DraftKey } from '../view/form-drafts.types';
import type { BodyDomSpec } from './body-dom.types';
import { CLIENT_TEXTS } from './client-texts.const';
import { h } from './dom-element';
import type { ElementProps } from './dom-element.types';

/** Читатель значения поля формы в момент отправки. */
type FieldReader = { readonly name: string; readonly read: () => string };

/** Общие свойства элемента ввода: имя, отключение, ключ фокуса, связь с подсказкой. */
type ControlProps = Pick<ElementProps, 'name' | 'disabled' | 'data' | 'aria'>;

/**
 * Построение тела области из модели: строки, карточка, зона «Выполнено»,
 * кнопки и формы. Всё решает модель; здесь только элементы и обработчики.
 * Текст людей — через `h`: `textContent` и `value`.
 */
export class BodyDom {
  constructor(private readonly spec: BodyDomSpec) {}

  build(model: RegionModel): HTMLElement[] {
    const body = model.body;
    if (body === undefined) return [];
    switch (body.kind) {
      case 'list':
        return [
          this.rows(body.rows, model, true),
          ...(body.empty === undefined
            ? []
            : [h('p', { class: 'empty', text: body.empty })]),
          this.actions(body.actions, model, (name) => this.run(name, model)),
          ...body.forms.map((form) => this.form(form, model)),
        ];
      case 'card':
        return [
          ...this.card(body, model),
          this.actions(body.actions, model, (name) =>
            name === 'complete' ? this.complete(model) : this.run(name, model),
          ),
          ...body.forms.map((form) => this.form(form, model)),
        ];
      case 'assigned':
        return [
          this.rows(body.rows, model, false),
          ...(body.empty === undefined
            ? []
            : [h('p', { class: 'empty', text: body.empty })]),
          this.actions(body.actions, model, (name) => this.run(name, model)),
        ];
      case 'user':
        return [
          h('p', { class: 'title', text: body.userId }),
          h('p', { class: 'status', text: body.status }),
        ];
      case 'menu':
        return [
          this.actions(body.actions, model, (name) => this.run(name, model)),
        ];
    }
  }

  private rows(
    rows: readonly TaskRowModel[],
    model: RegionModel,
    withOpen: boolean,
  ): HTMLElement {
    return h(
      'ul',
      { class: 'rows' },
      rows.map((row) => this.row(row, model, withOpen)),
    );
  }

  /** `withOpen` — у строки есть кнопка «Открыть» и перетаскивание; галочка — всегда. */
  private row(
    row: TaskRowModel,
    model: RegionModel,
    withOpen: boolean,
  ): HTMLElement {
    const title = h('span', {
      class: row.done ? 'title done' : 'title',
      text: row.title,
    });
    const status = row.done
      ? h('span', { class: 'status', text: CLIENT_TEXTS.done })
      : undefined;
    const { gestures, drag, name } = this.spec;
    const toggle = h('input', {
      type: 'checkbox',
      checked: row.selected,
      disabled: !row.selectable,
      data: { 'focus-key': `toggle:${row.uuid}` },
    });
    toggle.addEventListener('change', () => {
      void gestures.toggleTask(row.uuid, name);
    });
    if (!withOpen) return h('li', { class: 'row' }, [toggle, title, status]);
    const revision = model.revision;
    const open = h('button', {
      type: 'button',
      text: CLIENT_TEXTS.open,
      disabled: !row.openable || revision === undefined,
      data: { 'focus-key': `open:${row.uuid}` },
      click: () => {
        if (revision !== undefined) void gestures.openTask(row.uuid, revision);
      },
    });
    const item = h('li', { class: 'row', draggable: row.openable }, [
      toggle,
      title,
      status,
      open,
    ]);
    if (row.openable) drag.source(item, 'row', row.uuid);
    return item;
  }

  private card(body: CardBody, model: RegionModel): HTMLElement[] {
    const { drag } = this.spec;
    const head = h('div', { class: 'card-head', draggable: body.draggable }, [
      h('h3', { text: body.title }),
      h('span', {
        class: 'status',
        text: body.done ? CLIENT_TEXTS.statusDone : CLIENT_TEXTS.statusOpen,
      }),
    ]);
    if (body.draggable) drag.source(head, 'card', body.uuid);
    const zone = h('div', {
      class: body.zone === 'accepted' ? 'zone accepted' : 'zone',
      text:
        body.zone === 'accepted'
          ? CLIENT_TEXTS.zoneAccepted
          : CLIENT_TEXTS.zoneWaiting,
    });
    drag.target(
      zone,
      'card',
      () => body.dropEnabled,
      (taskId) => {
        if (taskId === body.uuid) this.complete(model);
      },
    );
    return [head, zone];
  }

  private actions(
    actions: readonly ActionModel[],
    model: RegionModel,
    run: (name: string) => void,
  ): HTMLElement {
    return h(
      'div',
      { class: 'actions' },
      actions.map((action) => this.action(action, model, run)),
    );
  }

  /**
   * Кнопка действия. Отключённое видом (`reason`) — фокусируемая, без `click`,
   * причина — подсказкой при наведении и скрытым текстом для скринридера;
   * пауза без причины — нативно отключённая.
   */
  private action(
    action: ActionModel,
    model: RegionModel,
    run: (name: string) => void,
  ): HTMLElement {
    const data = { 'focus-key': `action:${action.name}` };
    if (action.reason === undefined) {
      return h('button', {
        type: 'button',
        text: action.label,
        disabled: !action.enabled || model.revision === undefined,
        data,
        click: () => run(action.name),
      });
    }
    const id = ControlIds.reason(this.spec.name, action.name);
    return h('span', { class: 'action' }, [
      h('button', {
        type: 'button',
        text: action.label,
        title: action.reason,
        aria: { disabled: 'true', describedby: id },
        data,
      }),
      h('span', { class: 'reason', id, text: action.reason }),
    ]);
  }

  /** Кнопка действия без полей по ревизии показанного вида. */
  private run(action: string, model: RegionModel): void {
    if (model.revision === undefined) return;
    void this.spec.gestures.runAction(this.spec.name, action, model.revision);
  }

  /** «Выполнить» карточки — жестом с итогом до ответа. */
  private complete(model: RegionModel): void {
    if (model.revision === undefined) return;
    void this.spec.gestures.completeTask(this.spec.name, model.revision);
  }

  private form(form: FormModel, model: RegionModel): HTMLElement {
    const screen = model.screen ?? '';
    const readers: FieldReader[] = [];
    const fields = form.fields.map((field) => {
      const key: DraftKey = {
        region: this.spec.name,
        screen,
        form: form.name,
        field: field.name,
      };
      return this.field(form, field, key, readers);
    });
    const { reason } = form;
    const id = ControlIds.reason(this.spec.name, form.name);
    // Одна ветка: с причиной — фокусируемая кнопка, подсказка и скрытый текст, иначе нативный `disabled`.
    const gate =
      reason === undefined
        ? { props: { disabled: !form.enabled }, note: undefined }
        : {
            props: {
              title: reason,
              aria: { disabled: 'true', describedby: id },
            },
            note: h('span', { class: 'reason', id, text: reason }),
          };
    const submit = h('button', {
      type: 'submit',
      class: form.primary ? 'primary' : '',
      text: form.label,
      ...gate.props,
      data: { 'focus-key': `submit:${form.name}` },
    });
    const element = h('form', { class: 'form', novalidate: true }, [
      ...fields,
      this.issues(form.issues),
      submit,
      gate.note,
    ]);
    element.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.enabled) return;
      const values = Object.fromEntries(
        readers.map((reader) => [reader.name, reader.read()]),
      );
      void this.submit(form, screen, values, model.revision);
    });
    return element;
  }

  private async submit(
    form: FormModel,
    screen: string,
    values: Record<string, string>,
    revision: number | undefined,
  ): Promise<void> {
    const { gestures, drafts, name, redraw, focus } = this.spec;
    const outcome = await gestures.submitForm(
      name,
      form.name,
      values,
      revision,
    );
    // После успеха форма забывается; отказ и устаревание оставляют набранное.
    if (
      outcome?.kind === 'stayed' ||
      outcome?.kind === 'moved' ||
      outcome?.kind === 'exited'
    ) {
      drafts.forgetForm(name, screen, form.name);
      // Курсор — в первое поле формы: следующую запись можно набирать сразу.
      const first = form.fields[0];
      if (first !== undefined) {
        focus(ControlIds.fieldFocus(form.name, first.name));
      }
      redraw();
    }
  }

  private field(
    form: FormModel,
    field: FieldModel,
    key: DraftKey,
    readers: FieldReader[],
  ): HTMLElement {
    const { drafts, name } = this.spec;
    const value = drafts.value(key, field.value);
    const helpId = ControlIds.help(name, form.name, field.name);
    const aria = {
      ...(field.help === undefined ? {} : { describedby: helpId }),
      ...(field.hotkey === undefined ? {} : { keyshortcuts: field.hotkey }),
    };
    const common = {
      name: field.name,
      disabled: !form.enabled,
      data: {
        'focus-key': ControlIds.fieldFocus(form.name, field.name),
        ...(field.hotkey === undefined ? {} : { hotkey: field.hotkey }),
      },
      ...(Object.keys(aria).length === 0 ? {} : { aria }),
    };
    const input = this.control(field, common, value, key);
    readers.push({ name: field.name, read: input.read });
    return h('div', { class: 'field' }, [
      h('label', {}, [
        h('span', { class: 'label' }, [
          h('span', {
            text: field.optional
              ? `${field.label}${CLIENT_TEXTS.optional}`
              : field.label,
          }),
          field.hotkey === undefined
            ? undefined
            : h('kbd', {
                title: CLIENT_TEXTS.hotkey,
                aria: { hidden: 'true' },
                text: field.hotkey,
              }),
        ]),
        input.element,
      ]),
      field.help === undefined
        ? undefined
        : h('p', { class: 'help', id: helpId, text: field.help }),
      this.issues(field.issues),
    ]);
  }

  /** Элемент ввода по виджету модели и читатель его значения. */
  private control(
    field: FieldModel,
    common: ControlProps,
    value: string,
    key: DraftKey,
  ): { element: HTMLElement; read: () => string } {
    const { drafts } = this.spec;
    if (field.widget === 'checkbox') {
      if (field.checkbox === undefined) {
        throw new Error(`Поле ${field.name}: чекбокс без модели checkbox`);
      }
      const { on, off } = field.checkbox;
      const box = h('input', {
        ...common,
        type: 'checkbox',
        checked: value === on,
      });
      box.addEventListener('change', () =>
        drafts.track(key, box.checked ? on : off),
      );
      return { element: box, read: () => (box.checked ? on : off) };
    }
    if (field.widget === 'choice' || field.widget === 'person') {
      const select = h('select', { ...common, value }, this.options(field));
      select.addEventListener('change', () => drafts.track(key, select.value));
      return { element: select, read: () => select.value };
    }
    const input = h('input', {
      ...common,
      type: field.widget === 'text' ? 'text' : field.widget,
      value,
      ...(field.bounds ?? {}),
    });
    input.addEventListener('input', () => drafts.track(key, input.value));
    return { element: input, read: () => input.value };
  }

  /** Варианты выбора: подписи (`choice`) или люди примера по `uuid` (`person`). */
  private options(field: FieldModel): HTMLElement[] {
    const blank = h('option', { value: '', text: CLIENT_TEXTS.choose });
    if (field.widget === 'person') {
      return [
        blank,
        ...EXAMPLE_PEOPLE.map((person) =>
          h('option', { value: person.uuid, text: person.name }),
        ),
      ];
    }
    return [
      blank,
      ...(field.choices ?? []).map((label) =>
        h('option', { value: label, text: label }),
      ),
    ];
  }

  private issues(issues: readonly string[]): HTMLElement {
    return h(
      'ul',
      { class: 'issues' },
      issues.map((issue) => h('li', { text: issue })),
    );
  }
}
