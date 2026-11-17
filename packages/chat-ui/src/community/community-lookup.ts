import type { CommunityPorts } from './communities.types';

/**
 * Порты перевода сообщества (D-UI-59): личность транспорта ↔ uuid, handle
 * группы ↔ ключ домена. Пустая строка — «не знаем», как `undefined`: дальше
 * не идёт. Бросок порта — дефект, его ловит и пишет в лог вызывающий.
 */
export class CommunityLookup {
  constructor(private readonly ports: CommunityPorts) {}

  /** uuid по личности транспорта. */
  async person(member: string): Promise<string | undefined> {
    return CommunityLookup.known(await this.ports.people(member));
  }

  /** Личность транспорта по uuid. */
  async member(person: string): Promise<string | undefined> {
    return CommunityLookup.known(await this.ports.members(person));
  }

  /** Ключ домена сообщества по handle группы. */
  async key(handle: string): Promise<string | undefined> {
    return CommunityLookup.known(await this.ports.keys(handle));
  }

  /** handle группы по ключу домена сообщества. */
  async handle(key: string): Promise<string | undefined> {
    return CommunityLookup.known(await this.ports.handles(key));
  }

  private static known(value: string | undefined): string | undefined {
    return value === '' ? undefined : value;
  }
}
