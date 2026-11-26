import { describe, expect, it } from 'bun:test';
import { ExampleUiSetDef } from 'dmg-ui/example';
import { UiGraphProvider } from 'dmg-ui/graph';
import { TAKEN_CHANNELS } from '../packages/gen/src/front-layout.const';

// Генератор не импортирует ядро (`PackageDirections`), поэтому список занятых
// имён каналов у него свой. Здесь он сверяется с отказом ядра: ядро держит
// список у себя и наружу не отдаёт.

const refusedByCore = (name: string): boolean => {
  try {
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [],
      channels: [{ name }],
    });
    return false;
  } catch {
    return true;
  }
};

describe('занятые имена каналов генератора и ядра', () => {
  it('имена, которые генератор не считает каналами, — ровно те, что ядро отвергает как имя канала', () => {
    const probes = [
      'app',
      'logic',
      'ui',
      'kit',
      'core',
      'shell',
      'chat',
      'telegram',
      'web',
      'voice',
    ];

    expect(probes.filter(refusedByCore).sort()).toEqual(
      [...TAKEN_CHANNELS].sort(),
    );
  });
});
