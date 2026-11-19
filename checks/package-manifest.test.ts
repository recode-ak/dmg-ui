import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PackageManifest } from './package-manifest';

const ROOT = resolve(import.meta.dir, '..');

const manifest = () => PackageManifest.read(ROOT);

describe('PackageManifest', () => {
  describe('корневой package.json', () => {
    it('ключи exports — вход, chat-ui (и его testing), graph, server, testing (и fixtures), tg-bot (и его testing), web-ui (и его testing)', () => {
      expect(Object.keys(manifest().exports()).sort()).toEqual([
        '.',
        './chat-ui',
        './chat-ui/testing',
        './graph',
        './server',
        './testing',
        './testing/fixtures',
        './tg-bot',
        './tg-bot/testing',
        './web-ui',
        './web-ui/testing',
      ]);
    });

    it('цели exports существуют на диске', () => {
      for (const target of Object.values(manifest().exports())) {
        expect(existsSync(join(ROOT, target))).toBe(true);
      }
    });

    it('цели входов web-ui — исходники пакета и его привязки примера', () => {
      expect(manifest().exports()['./web-ui']).toBe(
        './packages/web-ui/src/index.ts',
      );
      expect(manifest().exports()['./web-ui/testing']).toBe(
        './packages/web-ui/testing/index.ts',
      );
    });

    it('вход dmg-ui/web-ui резолвится по имени пакета', async () => {
      expect(await import('dmg-ui/web-ui')).toBeDefined();
    });

    it('вход dmg-ui/web-ui/testing резолвится по имени пакета', async () => {
      expect(await import('dmg-ui/web-ui/testing')).toBeDefined();
    });

    it('smoke-скрипт импортирует каждый вход из exports и ничего лишнего', () => {
      const script = readFileSync(
        join(ROOT, 'scripts/consumer-smoke.sh'),
        'utf8',
      );
      const imported = [
        ...script.matchAll(/^import \* as \w+ from '(dmg-ui[^']*)';$/gm),
      ]
        .map((match) => match[1])
        .sort();
      const declared = Object.keys(manifest().exports())
        .map((key) => (key === '.' ? 'dmg-ui' : `dmg-ui/${key.slice(2)}`))
        .sort();

      expect(imported).toEqual(declared);
      for (const name of declared) {
        expect(script).toContain(`'${name}':`);
      }
    });

    it('вход dmg-ui резолвится по имени пакета', async () => {
      expect(await import('dmg-ui')).toBeDefined();
    });

    it('состав входа dmg-ui — манифесты UI, адрес, логика и исполнитель экрана', async () => {
      expect(Object.keys(await import('dmg-ui')).sort()).toEqual([
        'ActionInput',
        'Address',
        'AddressCodec',
        'Availability',
        'CodeLoader',
        'CodeLoaders',
        'ExitTargets',
        'FIELD_HINT_KEY',
        'FIELD_KINDS',
        'FieldDescription',
        'FieldInput',
        'NotificationCode',
        'NotificationDef',
        'RefreshOn',
        'ScreenAction',
        'ScreenCode',
        'ScreenDef',
        'ScreenExit',
        'ScreenLocal',
        'ScreenLogic',
        'ScreenPreview',
        'ScreenRuntime',
        'StoryDef',
        'StoryTree',
        'UiAppDef',
        'UiIds',
        'UiModuleDef',
        'UiSetDef',
        'fieldHint',
      ]);
    });

    it('вход dmg-ui/graph резолвится по имени пакета', async () => {
      expect(await import('dmg-ui/graph')).toBeDefined();
    });

    it('состав входа dmg-ui/graph — поставщик графа и его виды', async () => {
      expect(Object.keys(await import('dmg-ui/graph'))).toEqual(
        expect.arrayContaining(['UiGraphProvider', 'UI_KINDS']),
      );
    });

    it('граф в корень dmg-ui не попадает', async () => {
      const root = Object.keys(await import('dmg-ui'));

      expect(root).not.toContain('UiGraphProvider');
      expect(root).not.toContain('UI_KINDS');
    });

    it('вход dmg-ui/server резолвится по имени пакета', async () => {
      expect(await import('dmg-ui/server')).toBeDefined();
    });

    it('состав входа dmg-ui/server — сервер, уведомления, бэкенды вызова', async () => {
      expect(Object.keys(await import('dmg-ui/server'))).toEqual(
        expect.arrayContaining([
          'UiServer',
          'UiNotifier',
          'ApiAppDispatch',
          'ModuleApiDispatch',
          'RenderFlags',
          'RenderContexts',
        ]),
      );
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
