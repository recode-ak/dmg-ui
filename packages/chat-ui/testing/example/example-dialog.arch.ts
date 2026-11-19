import type { ArchApp } from 'dmg-core/arch';
import { ExampleArch } from 'dmg-core/testing';
import type { RenderContext } from 'dmg-ui';
import { ChatExamples, ChatGraphProvider } from 'dmg-ui/chat-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import { ExampleUiSetDef, exampleCodes, exampleSubject } from 'dmg-ui/testing';
import { MemoryMessenger } from '../messengers/memory-messenger';
import { ExampleDialogAppDef } from './example-dialog.app';
import { exampleDialogViews } from './example-dialog.views';
import { ExampleTrimmedDialogAppDef } from './example-trimmed.app';
import { ExampleWindowedAppDef } from './example-windowed.app';

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
 * Граф учебного примера: домен `ExampleArch`, поставщик `dmg-ui` с тремя
 * приложениями и один поставщик общей части мессенджеров — `exampleDialog`
 * и урезанное `exampleTrimmed` на мессенджере с правкой, `exampleWindowed` —
 * без правки, с окном; у каждого входа — точка входа (CH-02).
 */
export const ExampleDialogArch: ArchApp = {
  ...ExampleArch,
  providers: [
    new UiGraphProvider({
      set: ExampleUiSetDef,
      apps: [
        ExampleDialogAppDef,
        ExampleTrimmedDialogAppDef,
        ExampleWindowedAppDef,
      ],
    }),
    new ChatGraphProvider({
      apps: [
        {
          app: ExampleDialogAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleTrimmedDialogAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.editing().capabilities,
          entryPoints: [
            { entry: 'start', via: 'message', key: 'start' },
            { entry: 'assigned', via: 'message', key: 'assigned' },
            { entry: 'menu', via: 'message', key: 'menu' },
          ],
        },
        {
          app: ExampleWindowedAppDef,
          views: exampleDialogViews,
          capabilities: MemoryMessenger.windowed(() => 0).capabilities,
          entryPoints: [{ entry: 'start', via: 'message', key: 'start' }],
        },
      ],
      examples,
    }),
  ],
};
