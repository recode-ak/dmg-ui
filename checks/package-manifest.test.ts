import { describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PackageManifest } from './package-manifest';

const ROOT = resolve(import.meta.dir, '..');

const manifest = () => PackageManifest.read(ROOT);

describe('PackageManifest', () => {
  describe('корневой package.json', () => {
    it('ключи exports — ровно вход и testing', () => {
      expect(Object.keys(manifest().exports())).toEqual(['.', './testing']);
    });

    it('цели exports существуют на диске', () => {
      for (const target of Object.values(manifest().exports())) {
        expect(existsSync(join(ROOT, target))).toBe(true);
      }
    });

    it('вход dmg-ui резолвится по имени пакета', async () => {
      expect(await import('dmg-ui')).toBeDefined();
    });

    it('состав входа dmg-ui — манифесты UI и адрес (Ф2)', async () => {
      expect(Object.keys(await import('dmg-ui')).sort()).toEqual([
        'Address',
        'AddressCodec',
        'NotificationDef',
        'RefreshOn',
        'ScreenAction',
        'ScreenDef',
        'ScreenExit',
        'ScreenLocal',
        'StoryDef',
        'UiAppDef',
        'UiIds',
        'UiModuleDef',
        'UiSetDef',
      ]);
    });

    it('вход dmg-ui/testing резолвится по имени пакета', async () => {
      expect(await import('dmg-ui/testing')).toBeDefined();
    });

    it('поля dependencies нет', () => {
      expect(manifest().dependencies()).toEqual([]);
    });

    it('peerDependencies — ровно dmg-core и valibot', () => {
      expect([...manifest().peerDependencies()].sort()).toEqual([
        'dmg-core',
        'valibot',
      ]);
    });
  });

  describe('вход → каталог пакета', () => {
    const text = JSON.stringify({
      name: 'dmg-ui',
      exports: {
        '.': './packages/core/src/index.ts',
        './tg-bot': './packages/tg-bot/src/index.ts',
      },
    });

    it('имя входа собирается из имени пакета и ключа exports', () => {
      expect(PackageManifest.parse(text).entries()).toEqual({
        'dmg-ui': 'core',
        'dmg-ui/tg-bot': 'tg-bot',
      });
    });

    it('каталог цели входа — по exports', () => {
      expect(PackageManifest.parse(text).entryDirs()).toEqual({
        'dmg-ui': 'packages/core/src',
        'dmg-ui/tg-bot': 'packages/tg-bot/src',
      });
    });

    it('цель вне packages — исключение', () => {
      const bad = JSON.stringify({
        name: 'dmg-ui',
        exports: { '.': './src/index.ts' },
      });
      expect(() => PackageManifest.parse(bad).entries()).toThrow();
    });
  });
});
