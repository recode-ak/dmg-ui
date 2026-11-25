import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { ChannelDecisionScanner } from './channel-decision-scanner';
import { SourceFile, SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Каналы не решают, доступно ли действие: решение приходит в виде готовым
// ответом, а Policy, правила домена и Ar видит только код экранов. Слова
// решения в исходниках каналов — признак того, что канал начал решать сам.
// Тесты не проверяются; слово в комментарии — нарушение.

const ROOT = resolve(import.meta.dir, '..');
const CHANNELS = ['chat-ui', 'tg-bot', 'web-ui'];
const CHAT_UI = 'packages/chat-ui/src/view/x.ts';
const TG_BOT = 'packages/tg-bot/src/messenger/x.ts';
const WEB_UI = 'packages/web-ui/src/client/x.ts';

const scan = (text: string, path: string): Violation[] =>
  new ChannelDecisionScanner().scan([SourceFile.of(path, text)]);

describe('ChannelDecisionScanner — слова решения', () => {
  const words: [string, string][] = [
    ["import { Policy } from 'dmg-core';", 'Policy'],
    ['const rule: DomainRuleDef = taken;', 'DomainRuleDef'],
    ['const ar = ReadonlyAr.of(state);', 'ReadonlyAr'],
    ["const admin = subject.hasRole('admin');", 'hasRole'],
    ['const text = error.denyMessage;', 'denyMessage'],
    ['const verdict = rule.evaluate(subject, ctx);', '.evaluate('],
  ];

  for (const [line, word] of words) {
    for (const path of [CHAT_UI, TG_BOT, WEB_UI]) {
      it(`«${word}» в ${path} — нарушение с файлом и строкой`, () => {
        const found = scan(`const a = 1;\n${line}\n`, path);

        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ file: path, line: 2 });
        expect(found[0]?.text).toContain(word);
      });
    }
  }

  it('несколько слов в строке — по нарушению на каждое', () => {
    const found = scan('subject.hasRole(r); error.denyMessage;', WEB_UI);

    expect(found.map((violation) => violation.text)).toEqual([
      'hasRole',
      'denyMessage',
    ]);
  });

  it('слово в комментарии — нарушение', () => {
    expect(scan('// Policy скрывает действие', CHAT_UI)).toHaveLength(1);
  });

  it('нарушения нескольких файлов — каждое со своим путём', () => {
    const found = new ChannelDecisionScanner().scan([
      SourceFile.of(CHAT_UI, 'x.denyMessage;'),
      SourceFile.of(WEB_UI, 'y.denyMessage;'),
    ]);

    expect(found.map((violation: Violation) => violation.file)).toEqual([
      CHAT_UI,
      WEB_UI,
    ]);
  });
});

describe('ChannelDecisionScanner — зона проверки', () => {
  const line = 'const verdict = rule.evaluate(subject, ctx);';

  for (const path of [
    'packages/chat-ui/src/x.ts',
    'packages/tg-bot/src/x.ts',
    'packages/web-ui/src/x.ts',
    'packages/web-ui/src/client/deep/x.ts',
    'packages/web-ui/src/view/x.ts',
    'packages/web-ui/src/server/x.ts',
  ]) {
    it(`${path} проверяется`, () => {
      expect(scan(line, path)).toHaveLength(1);
    });
  }

  for (const path of [
    'packages/core/src/screen/x.ts',
    'packages/core/testing/x.ts',
    'packages/chat-ui/testing/x.ts',
    'packages/tg-bot/testing/x.ts',
    'packages/web-ui/testing/x.ts',
    'packages/example/src/runners/web/x.ts',
    'packages/example/src/runners/tg-bot/x.ts',
    'checks/x.ts',
    'acceptance/x.ts',
  ]) {
    it(`${path} вне зоны`, () => {
      expect(scan(line, path)).toEqual([]);
    });
  }

  for (const path of [
    'packages/chat-ui/src/view/x.test.ts',
    'packages/tg-bot/src/x.test.ts',
    'packages/web-ui/src/client/x.test.ts',
  ]) {
    it(`тест ${path} не проверяется`, () => {
      expect(scan(`${line}\nsubject.hasRole(r);`, path)).toEqual([]);
    });
  }
});

describe('ChannelDecisionScanner — не слова решения', () => {
  for (const clean of [
    'const verdict = evaluate(value);',
    'const all = list.evaluateAll(items);',
    'el.textContent = value;',
    'const view = reviveSubject(raw);',
    "const kind = view.availability.kind === 'available';",
    'const reason = form.reason;',
  ]) {
    it(`«${clean}» не срабатывает`, () => {
      expect(scan(clean, WEB_UI)).toEqual([]);
    });
  }
});

describe('ChannelDecisionScanner — реальный репо', () => {
  it('на исходниках каналов chat-ui, tg-bot, web-ui — ноль нарушений', () => {
    const files = CHANNELS.flatMap((channel) =>
      SourceTree.read(ROOT, `packages/${channel}/src`),
    );

    expect(new ChannelDecisionScanner().scan(files)).toEqual([]);
  });

  for (const channel of CHANNELS) {
    it(`исходники packages/${channel}/src не пусты: проверка не вхолостую`, () => {
      expect(
        SourceTree.read(ROOT, `packages/${channel}/src`).length,
      ).toBeGreaterThan(0);
    });
  }
});
