import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import type { DraftKey } from '../view/form-drafts.types';
import type {
  ActionModel,
  CardBody,
  FieldModel,
  FormModel,
  RegionModel,
  TaskRowModel,
} from '../view/region-model.types';
import type { BodyDomSpec } from './body-dom.types';
import { CLIENT_TEXTS } from './client-texts.const';
import { h } from './dom-element';

/** Читатель значения поля формы в момент отправки. */
type FieldReader = { readonly name: string; readonly read: () => string };

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
        ];
      case 'user':
        return [
          h('p', { class: 'title', text: body.userId }),
          h('p', { class: 'status', text: body.status }),
        ];
      case 'menu':
        return [];
    }
  }

  private rows(
    rows: readonly TaskRowModel[],
    model: RegionModel,
    interactive: boolean,
  ): HTMLElement {
    return h(
      'ul',
      { class: 'rows' },
      rows.map((row) => this.row(row, model, interactive)),
    );
  }

  private row(
    row: TaskRowModel,
    model: RegionModel,
    interactive: boolean,
  ): HTMLElement {
    const title = h('span', {
      class: row.done ? 'title done' : 'title',
      text: row.title,
    });
    const status = row.done
      ? h('span', { class: 'status', text: CLIENT_TEXTS.done })
      : undefined;
    if (!interactive) return h('li', { class: 'row' }, [title, status]);
    const { gestures, drag } = this.spec;
    const toggle = h('input', {
      type: 'checkbox',
      checked: row.selected,
      disabled: !row.selectable,
      data: { 'focus-key': `toggle:${row.uuid}` },
    });
    toggle.addEventListener('change', () => {
      void gestures.toggleTask(row.uuid);
    });
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
      actions.map((action) =>
        h('button', {
          type: 'button',
          text: action.label,
          disabled: !action.enabled || model.revision === undefined,
          data: { 'focus-key': `action:${action.name}` },
          click: () => run(action.name),
        }),
      ),
    );
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
    const submit = h('button', {
      type: 'submit',
      class: form.primary ? 'primary' : '',
      text: form.label,
      disabled: !form.enabled,
      data: { 'focus-key': `submit:${form.name}` },
    });
    const element = h('form', { class: 'form' }, [
      ...fields,
      this.issues(form.issues),
      submit,
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
    const { gestures, drafts, name, redraw } = this.spec;
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
      redraw();
    }
  }

  private field(
    form: FormModel,
    field: FieldModel,
    key: DraftKey,
    readers: FieldReader[],
  ): HTMLElement {
    const { drafts } = this.spec;
    const value = drafts.value(key, field.value);
    const data = { 'focus-key': `field:${form.name}:${field.name}` };
    let control: HTMLInputElement | HTMLSelectElement;
    if (field.widget === 'text') {
      control = h('input', {
        type: 'text',
        name: field.name,
        value,
        disabled: !form.enabled,
        data,
      });
      control.addEventListener('input', () => drafts.track(key, control.value));
    } else {
      control = h(
        'select',
        { name: field.name, value, disabled: !form.enabled, data },
        this.options(field),
      );
      control.addEventListener('change', () =>
        drafts.track(key, control.value),
      );
    }
    const input = control;
    readers.push({ name: field.name, read: () => input.value });
    return h('label', { class: 'field' }, [
      h('span', {
        class: 'label',
        text: field.optional
          ? `${field.label}${CLIENT_TEXTS.optional}`
          : field.label,
      }),
      control,
      this.issues(field.issues),
    ]);
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
