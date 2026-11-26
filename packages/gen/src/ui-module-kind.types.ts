import type { LayerPackage } from 'dmg-core/gen';
import type { ChannelTech, FrontChannel } from './front-layout.types';
import type { RootManifest } from './root-manifest';

/** Канал с шаблоном реестра представлений */
export type TemplatedChannel = FrontChannel & { readonly tech: ChannelTech };

/** Пакеты единиц модуля и то, из чего строятся их манифесты */
export type UnitPackages = {
  /** Код модуля и каналы с шаблоном, у слоя которых есть `package` */
  readonly packages: readonly LayerPackage[];
  /** Пакет описания: зависимость каждого пакета единицы */
  readonly ui: LayerPackage;
  /** Строка `dmg-ui` из `package.json` корня */
  readonly dmgUi: string;
  readonly manifest: RootManifest;
};
