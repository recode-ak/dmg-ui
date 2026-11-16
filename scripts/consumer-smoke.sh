#!/usr/bin/env bash
# Проверка установки dmg-ui глазами потребителя: пустой проект, установка по
# спецификатору, импорт восьми входов, запуск и tsc. Сеть и ssh нужны, поэтому
# в `bun run check` скрипт не входит.
#
#   bun run smoke git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.1.0
#   bun run smoke git+file:///путь/к/клону#v0.1.0
#
# Аргумент — спецификатор источника dmg-ui. dmg-core ставится той же командой
# (peer: Bun ищет его в npm и получает 404), тег — из devDependencies репо.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: consumer-smoke.sh <спецификатор dmg-ui, например git+ssh://…#v0.1.0>" >&2
  exit 2
fi
SOURCE="$1"
PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE="$(jq -r '.devDependencies["dmg-core"]' "$PKG/package.json")"
case "$CORE" in
  git+*#v*) ;;
  *)
    echo "smoke: devDependencies.dmg-core не git-адрес с тегом: $CORE" >&2
    exit 1
    ;;
esac
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "smoke: установка $SOURCE (dmg-core: $CORE)"
cd "$WORK"
cat >package.json <<'JSON'
{ "name": "consumer", "private": true, "type": "module" }
JSON
bun add valibot @valibot/to-json-schema "$CORE" "$SOURCE" >/dev/null
bun add -d typescript @types/bun >/dev/null

cat >tsconfig.json <<'JSON'
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "Preserve",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": false,
    "types": ["bun"]
  },
  "include": ["smoke.ts"]
}
JSON

cat >smoke.ts <<'TS'
import * as core from 'dmg-ui';
import * as graph from 'dmg-ui/graph';
import * as server from 'dmg-ui/server';
import * as testing from 'dmg-ui/testing';
import * as fixtures from 'dmg-ui/testing/fixtures';
import * as chatUi from 'dmg-ui/chat-ui';
import * as chatUiTesting from 'dmg-ui/chat-ui/testing';
import * as tgBot from 'dmg-ui/tg-bot';

// Второй член — вход вправе быть пустым (пустой каркас пакета).
const entries: Record<string, [object, boolean]> = {
  'dmg-ui': [core, false],
  'dmg-ui/graph': [graph, false],
  'dmg-ui/server': [server, false],
  'dmg-ui/testing': [testing, false],
  'dmg-ui/testing/fixtures': [fixtures, false],
  'dmg-ui/chat-ui': [chatUi, false],
  'dmg-ui/chat-ui/testing': [chatUiTesting, false],
  'dmg-ui/tg-bot': [tgBot, true],
};
for (const [name, [module, mayBeEmpty]] of Object.entries(entries)) {
  const count = Object.keys(module).length;
  if (count === 0 && !mayBeEmpty) {
    console.error(`smoke: вход ${name} пуст`);
    process.exit(1);
  }
  console.log(`smoke: ${name} — ${count} экспортов`);
}
TS

echo "smoke: bun run"
bun run smoke.ts
echo "smoke: tsc --noEmit"
bunx tsc --noEmit
echo "smoke: ok"
