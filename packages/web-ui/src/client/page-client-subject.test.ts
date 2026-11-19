import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Rule } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ExampleAppDef, type ExampleUser } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  CodeLoader,
  CodeLoaders,
  type LoadContext,
  type RenderContext,
  ScreenCode,
  ScreenDef,
  UiAppDef,
  type UiFault,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { MemoryUiObserver } from 'dmg-ui/testing';
import * as v from 'valibot';
import { ManualPageClock } from '../../testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';

// Субъект на вкладке: `hello` несёт его JSON, `reviveSubject` восстанавливает
// один раз на соединение, код экрана видит восстановленное в `load`, а
// доступность действий считается по нему. Экран-проба и конец провода —
// заглушки: канал и ядро — настоящие.

const USER_ID = testUuid(1);
const ADMIN_ID = testUuid(3);
const SECRET = 'секрет-субъекта-42';

const ProbeScreenDef = ScreenDef.define({
  name: 'probe',
  label: 'Проба',
  description: 'Экран, который видит субъекта.',
  reads: [],
  data: v.object({}),
  actions: {
    manage: { label: 'Управлять', description: 'Только администратору.' },
  },
});

type Probe = typeof ProbeScreenDef;

/** Код пробы: помнит субъекта из `load`; «Управлять» решает роль. */
class ProbeCode extends ScreenCode<Probe, ExampleUser> {
  readonly seen: unknown[] = [];

  override readonly actions: Partial<ActionSteps<Probe>> = {
    manage: { done: () => ProbeScreenDef.at({}) },
  };

  override readonly availability = {
    manage: ({ subject }: { readonly subject?: ExampleUser }) =>
      Availability.policy(Rule.hasRole('admin'), subject, {}),
  };

  override async load(
    ctx: LoadContext<Probe>,
  ): Promise<Result<Record<string, never>, DomainError>> {
    this.seen.push(ctx.context.subject);
    return ok({});
  }
}

const ProbeSetDef = UiSetDef.define({
  name: 'probeUi',
  label: 'Набор пробы',
  description: 'Экран, видящий субъекта.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'checks',
      label: 'Проверки',
      description: 'Проба субъекта.',
      screens: [ProbeScreenDef],
      stories: [],
    }),
  ],
});

const ProbeAppDef = UiAppDef.define({
  name: 'probePages',
  label: 'Проба на страницах',
  description: 'Приложение страниц с пробой субъекта.',
  set: ProbeSetDef,
  channel: PAGE_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Проба',
      description: 'Экран-проба.',
      address: ProbeScreenDef.at({}),
    },
  },
});

const Wire = v.strictObject({ uuid: v.string(), roles: v.array(v.string()) });

/** Субъект проекта из JSON `hello` — как у привязки учебного примера. */
const revive = (raw: unknown): ExampleUser => {
  const wire = v.parse(Wire, raw);
  return {
    uuid: wire.uuid,
    hasRole: (role) => wire.roles.includes(role),
  };
};

/** Конец провода: контекст `hello` с JSON субъекта `subject`; вызовов UC у пробы нет. */
class StubEnd implements ClientEnd {
  readonly context: RenderContext;

  constructor(subject: unknown) {
    this.context = {
      locale: 'ru-RU',
      timeZone: 'Asia/Oral',
      delegate: false,
      readOnly: false,
      subject,
    };
  }

  send(message: ClientMsg): void {
    if (message.kind === 'call') {
      throw new Error('StubEnd: у пробы нет вызовов UC');
    }
  }

  onMessage(_handler: (message: ServerMsg) => void): void {}

  onBreak(_handler: (error: Error) => void): void {}

  close(): void {}
}

const user = () => new StubEnd({ uuid: USER_ID, roles: [] });
const admin = () => new StubEnd({ uuid: ADMIN_ID, roles: ['admin'] });

const flush = async () => {
  for (let turn = 0; turn < 100; turn += 1) await Promise.resolve();
};

const tabOf = async (
  end: ClientEnd,
  reviveSubject: (raw: unknown) => unknown = revive,
) => {
  const code = new ProbeCode();
  const faults: UiFault[] = [];
  const observer = new MemoryUiObserver();
  const client = new PageClient({
    app: ProbeAppDef,
    codes: CodeLoaders.of(ProbeSetDef, [
      CodeLoader.screen(ProbeScreenDef, async () => code),
    ]),
    routes: [],
    end,
    observer,
    clock: new ManualPageClock(),
    reviveSubject,
    faults: (fault) => faults.push(fault),
  });
  await client.route('/checks/probe');
  return { client, code, faults, observer };
};

const manageOf = (client: PageClient) =>
  client.region('main').view?.actions.find((a) => a.name === 'manage')
    ?.availability;

describe('PageClient — субъект из hello', () => {
  test('код экрана видит восстановленного субъекта, а не JSON', async () => {
    const { code } = await tabOf(user());

    expect(code.seen).toHaveLength(1);
    expect(code.seen[0]).toMatchObject({ uuid: USER_ID });
    expect(code.seen[0]).toHaveProperty('hasRole');
  });

  test('reviveSubject зовётся один раз на соединение: повторный переход и действие', async () => {
    let revived = 0;
    const { client } = await tabOf(admin(), (raw) => {
      revived += 1;
      return revive(raw);
    });

    await client.route('/checks/probe');
    await client.submit('main', 'manage', {});
    await flush();

    expect(revived).toBe(1);
  });

  test('субъект доходит до доступности: администратору «Управлять» доступно', async () => {
    const { client } = await tabOf(admin());

    expect(manageOf(client)).toEqual({ kind: 'available' });
  });

  test('субъект без роли — «Управлять» скрыто, в виде действия нет', async () => {
    const { client } = await tabOf(user());

    expect(manageOf(client)).toBeUndefined();
  });

  test('вид области не несёт субъекта', async () => {
    const { client } = await tabOf(admin());

    const context = client.region('main').view?.context;

    expect(context).toBeDefined();
    expect(context && 'subject' in context).toBe(false);
  });

  test('revive бросил — субъект undefined, запись в faults фиксированным текстом без значений wire', async () => {
    const failing = (raw: unknown): never => {
      throw new Error(`не разобрать ${JSON.stringify(raw)}`);
    };

    const { code, faults, client } = await tabOf(
      new StubEnd({ uuid: SECRET, roles: ['admin'] }),
      failing,
    );

    expect(code.seen).toEqual([undefined]);
    expect(manageOf(client)).toBeUndefined();
    expect(faults).toHaveLength(1);
    expect(faults[0]?.node).toBe(PAGE_CHANNEL);
    expect(String(faults[0]?.error)).not.toContain(SECRET);
  });

  test('hello без субъекта — субъект undefined, revive не зовётся', async () => {
    let revived = 0;
    const { code } = await tabOf(new StubEnd(undefined), (raw) => {
      revived += 1;
      return revive(raw);
    });

    expect(code.seen).toEqual([undefined]);
    expect(revived).toBe(0);
  });

  test('новое соединение с другим субъектом — восстановление заново, область перечитана с ним', async () => {
    let revived = 0;
    const { client, code } = await tabOf(user(), (raw) => {
      revived += 1;
      return revive(raw);
    });
    expect(manageOf(client)).toBeUndefined();

    await client.attach(admin());
    await flush();

    expect(revived).toBe(2);
    expect(code.seen.at(-1)).toMatchObject({ uuid: ADMIN_ID });
    expect(manageOf(client)).toEqual({ kind: 'available' });
  });

  test('субъект не попадает в снимок вкладки и записи наблюдателя', async () => {
    const { client, code, observer } = await tabOf(
      new StubEnd({ uuid: SECRET, roles: ['admin'] }),
    );

    await client.submit('main', 'manage', {});
    await flush();

    expect(code.seen[0]).toMatchObject({ uuid: SECRET });
    expect(JSON.stringify(client.snapshot())).not.toContain(SECRET);
    expect(observer.records.length).toBeGreaterThan(0);
    expect(JSON.stringify(observer.records)).not.toContain(SECRET);
  });
});
