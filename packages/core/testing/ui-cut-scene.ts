import { ok } from 'dmg-core';
import {
  type ActionSteps,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  ScreenCode,
  ScreenDef,
  ScreenRuntime,
} from 'dmg-ui';
import * as v from 'valibot';
import { MemoryUiObserver } from './memory-ui-observer';
import { UiScene } from './ui-arch';
import { RuntimeKit, StubRefreshPort, StubUcPort } from './ui-runtime.fixture';

// Сцена отрезанной ветки для тестов исполнителя: экран `hub` ведёт на `inside`
// (сторис приложения) и на `ghost` (сторис, связанная с приложением, но в него
// не входящая). Внутренний помощник тестов ядра.

const empty = (name: string) =>
  ScreenDef.define({
    name,
    label: `Экран ${name}`,
    description: `Экран ${name} сцены отрезанной ветки.`,
    reads: [],
    data: v.object({}),
  });

const ghost = empty('ghost');
const inside = empty('inside');
const hub = ScreenDef.define({
  name: 'hub',
  label: 'Экран hub',
  description: 'Экран с двумя переходами; основное — в отрезанную сторис.',
  reads: [],
  data: v.object({}),
  primary: 'toGhost',
  actions: {
    toGhost: {
      label: 'В отрезанную сторис',
      description: 'Ведёт только в сторис вне приложения.',
      to: () => [ghost],
    },
    toInside: {
      label: 'В сторис приложения',
      description: 'Ведёт в сторис приложения.',
      to: () => [inside],
    },
  },
});

class HubCode extends ScreenCode<typeof hub> {
  override readonly actions: Partial<ActionSteps<typeof hub>> = {
    toGhost: { done: () => ghost.at({}) },
    toInside: { done: () => inside.at({}) },
  };

  override async load() {
    return ok({});
  }
}

class GhostCode extends ScreenCode<typeof ghost> {
  override async load() {
    return ok({});
  }
}

class InsideCode extends ScreenCode<typeof inside> {
  override async load() {
    return ok({});
  }
}

const ghostStory = UiScene.story('ghostStory', [ghost]);
const hubStory = UiScene.story('hubStory', [hub, inside], {
  leads: () => [ghostStory],
});
const scene = new UiScene({
  screens: [hub, inside, ghost],
  stories: [hubStory, ghostStory],
  appStories: [hubStory],
});

/** Исполнитель сцены; `withApp: false` — исполнитель без приложения. */
export class CutKit {
  readonly runtime: ScreenRuntime;

  constructor(withApp = true) {
    const module = CodeLoaders.of(scene.module, [
      CodeLoader.screen(hub, async () => new HubCode()),
      CodeLoader.screen(inside, async () => new InsideCode()),
      CodeLoader.screen(ghost, async () => new GhostCode()),
    ]);
    const codes = withApp
      ? AppCodeLoaders.of(scene.app, [module])
      : AppCodeLoaders.ofSet(scene.set, [module]);
    this.runtime = new ScreenRuntime({
      set: scene.set,
      codes,
      ucs: new StubUcPort(),
      refresh: new StubRefreshPort(),
      observer: new MemoryUiObserver(),
      ...(withApp ? { app: scene.app } : {}),
    });
  }

  /** Экземпляр `hub`. */
  open() {
    return this.runtime.open(hub.at({}), RuntimeKit.options());
  }
}
