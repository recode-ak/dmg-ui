import { expect, test } from 'bun:test';
import { AppGraph } from 'dmg-core/graph';
import { ExampleAppDef } from 'dmg-core/testing/example';
import { ExampleUiSetDef, FinishTasksStoryDef } from 'dmg-ui/example';
import { ExampleStubUiAppDef } from '../../testing/ui-app.fixture';
import { UiIds } from '../address/ui-ids';
import { UiGraphProvider } from './ui-graph-provider';
import { UiGraphReader } from './ui-graph-reader';
import { UiStoryEntries } from './ui-story-entries';

test('UiGraphReader.stories(): startsFrom сторис отдаётся разобранным', () => {
  const graph = new AppGraph({
    def: ExampleAppDef,
    providers: [
      new UiGraphProvider({
        set: ExampleUiSetDef,
        apps: [ExampleStubUiAppDef],
        channels: [],
      }),
    ],
  }).build();
  const ids = new UiIds(ExampleUiSetDef);
  const entries = new UiStoryEntries(
    ExampleUiSetDef,
    [ExampleStubUiAppDef],
    ids,
  );

  const finish = new UiGraphReader(graph)
    .stories()
    .find((story) => story.node.id === ids.story(FinishTasksStoryDef));

  expect(finish?.props.startsFrom).toEqual(entries.of(FinishTasksStoryDef));
  expect(finish?.props.startsFrom).not.toHaveLength(0);
});
