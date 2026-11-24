import type { ArchApp } from 'dmg-core/arch';
import { ExampleAppDef } from 'dmg-core/testing';
import type { RenderContext } from 'dmg-ui';
import { ChatExamples, ChatGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef, exampleCodes, exampleSubject } from 'dmg-ui/testing';
import { MemoryMessenger } from '../messengers/memory-messenger';
import { ExampleDialogUiAppDef } from './example-dialog.ui-app';
import { exampleDialogViews } from './example-dialog.views';
import { ExampleTrimmedUiAppDef } from './example-trimmed.ui-app';
import { ExampleWindowedUiAppDef } from './example-windowed.ui-app';

/**
 * Контекст примеров: место примеров по умолчанию и субъект примеров — без
 * субъекта действия по правам скрыты, и CH-01 видит урезанный вид (D-UI-99).
 */
const EXAMPLES_CONTEXT: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: exampleSubject,
};

/** Примеры учебного набора для CH-01: собираются до графа (`await` на верхнем уровне). */
const examples = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
  context: EXAMPLES_CONTEXT,
});

/**
 * Граф учебного примера без домена: поставщик `dmg-ui` с тремя приложениями и
 * поставщик общей части мессенджеров; у каждого входа — точка входа (CH-02).
 * Канал — `chat`; каталогов слоёв фронта у примера пока нет: его файлы лежат
 * вне слоёв, пока раскладка примера не разделена по слоям.
 * @see ./example-dialog.arch.test.ts
 */
export const ExampleDialogArch: ArchApp = {
  def: ExampleAppDef,
  project: import.meta.dir,
  runners: [],
  layers: {
    ui: [`${import.meta.dir}/platform/ui`],
    'fe-app': [`${import.meta.dir}/frontend/app`],
    'fe-logic': [`${import.meta.dir}/frontend/{m}/logic`],
    'fe-chat': [`${import.meta.dir}/frontend/{m}/chat`],
    'chat-kit': [`${import.meta.dir}/frontend/chat-kit`],
  },
  graphEntry: import.meta.path,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [
        ExampleDialogUiAppDef,
        ExampleTrimmedUiAppDef,
        ExampleWindowedUiAppDef,
      ],
      channels: [{ name: 'chat' }],
    }),
    new ChatGraphProvider({
      apps: [
        {
          app: ExampleDialogUiAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleTrimmedUiAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleWindowedUiAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.windowed(() => 0).capabilities,
          entryPoints: [{ entry: 'start', via: 'message', key: 'start' }],
        },
      ],
      examples,
    }),
  ],
};
