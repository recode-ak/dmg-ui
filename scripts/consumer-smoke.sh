#!/usr/bin/env bash
# Проверка установки dmg-ui глазами потребителя: пустой проект, установка по
# спецификатору, импорт тринадцати входов и сверка их с `exports`, запуск и tsc;
# шаг `dmg-core sync` и проверка, что роли и скил `dmg-ui` доставлены в проект.
# Сеть и ssh нужны, поэтому в `bun run check` скрипт не входит.
#
#   bun run smoke git+ssh://git@github.com/recode-ak/dmg-ui.git#v0.3.0
#   bun run smoke git+file:///путь/к/клону#v0.3.0
#
# Аргумент — спецификатор источника dmg-ui. dmg-core ставится той же командой
# (peer: Bun ищет его в npm и получает 404), тег — из devDependencies репо.
# Если спецификатор оканчивается на `#vX.Y.Z`, версия установленного dmg-ui
# обязана быть `X.Y.Z`: тег и `version` пакета не должны расходиться. Без такого
# тега (`#main`, `#v0.3.0-rc`, нет `#`) версия не сверяется — скрипт об этом пишет.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: consumer-smoke.sh <спецификатор dmg-ui, например git+ssh://…#v0.3.0>" >&2
  exit 2
fi
SOURCE="$1"
EXPECTED_VERSION=""
if [[ "$SOURCE" =~ \#v([0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
  EXPECTED_VERSION="${BASH_REMATCH[1]}"
else
  echo "smoke: версия не сверена (спецификатор без тега vX.Y.Z)"
fi
export EXPECTED_VERSION
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
import * as dmgCore from 'dmg-ui/dmg-core';
import * as example from 'dmg-ui/example';
import * as tgBot from 'dmg-ui/tg-bot';
import * as tgBotTesting from 'dmg-ui/tg-bot/testing';
import * as webUi from 'dmg-ui/web-ui';
import * as webUiTesting from 'dmg-ui/web-ui/testing';

const entries: Record<string, object> = {
  'dmg-ui': core,
  'dmg-ui/graph': graph,
  'dmg-ui/server': server,
  'dmg-ui/testing': testing,
  'dmg-ui/testing/fixtures': fixtures,
  'dmg-ui/chat-ui': chatUi,
  'dmg-ui/chat-ui/testing': chatUiTesting,
  'dmg-ui/dmg-core': dmgCore,
  'dmg-ui/example': example,
  'dmg-ui/tg-bot': tgBot,
  'dmg-ui/tg-bot/testing': tgBotTesting,
  'dmg-ui/web-ui': webUi,
  'dmg-ui/web-ui/testing': webUiTesting,
};
for (const [name, module] of Object.entries(entries)) {
  const count = Object.keys(module).length;
  if (count === 0) {
    console.error(`smoke: вход ${name} пуст`);
    process.exit(1);
  }
  console.log(`smoke: ${name} — ${count} экспортов`);
}

// Список выше держится руками: сверка с `exports` ловит вход, который пакет
// объявил, а smoke не проверяет, и наоборот.
const manifest = (await Bun.file('node_modules/dmg-ui/package.json').json()) as {
  version: string;
  exports: Record<string, unknown>;
};
const declared = Object.keys(manifest.exports)
  .map((key) => (key === '.' ? 'dmg-ui' : `dmg-ui/${key.slice(2)}`))
  .sort();
const checked = Object.keys(entries).sort();
if (declared.join() !== checked.join()) {
  console.error(`smoke: входы пакета [${declared.join(', ')}] ≠ проверяемым [${checked.join(', ')}]`);
  process.exit(1);
}
console.log(`smoke: установлен dmg-ui ${manifest.version}, входов ${checked.length}`);
const expected = process.env.EXPECTED_VERSION ?? '';
if (expected !== '' && manifest.version !== expected) {
  console.error(`smoke: версия установленного dmg-ui ${manifest.version} ≠ тегу ${expected}`);
  process.exit(1);
}
TS

echo "smoke: dmg-core sync (скил и роли поставщика)"
mkdir -p .dmg
cat >.dmg/config.json <<'JSON'
{ "providers": ["dmg-ui"] }
JSON
bunx dmg-core sync >/dev/null
for delivered in .claude/skills/dmg-ui/SKILL.md .claude/agents/dmg-ui-author.md .claude/agents/dmg-ux.md; do
  if [ ! -s "$delivered" ]; then
    echo "smoke: sync не доставил $delivered" >&2
    exit 1
  fi
done

echo "smoke: bun run"
bun run smoke.ts
echo "smoke: tsc --noEmit"
bunx tsc --noEmit
echo "smoke: ok"
