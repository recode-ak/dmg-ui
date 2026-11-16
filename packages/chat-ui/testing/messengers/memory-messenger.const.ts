import type { MessengerCapabilities } from 'dmg-ui/chat-ui';

/** Сутки в мс — окно инициативы набора `windowed`. */
const DAY_MS = 86_400_000;

/** «Правит сообщения, вариантов много»: писать первым можно всегда. */
export const EDITING_CAPABILITIES: MessengerCapabilities = {
  name: 'memory-editing',
  kinds: ['text'],
  edit: true,
  text: { max: 4096, unit: 'utf16' },
  textWithOptions: { max: 4096, unit: 'utf16' },
  options: { max: 100, label: { max: 64, unit: 'grapheme' }, ref: 64 },
  pressAnswer: { max: 200, unit: 'utf16' },
  form: false,
  initiative: { kind: 'always' },
  community: {
    signals: ['joined', 'left', 'added', 'removed'],
    operations: ['exclude', 'invite', 'approve', 'inviteLink'],
  },
};

/** «Не правит, три варианта, окно инициативы»: ответа на нажатие нет. */
export const WINDOWED_CAPABILITIES: MessengerCapabilities = {
  name: 'memory-windowed',
  kinds: ['text'],
  edit: false,
  text: { max: 4096, unit: 'codePoint' },
  textWithOptions: { max: 1024, unit: 'codePoint' },
  options: { max: 3, label: { max: 20, unit: 'grapheme' }, ref: 256 },
  form: false,
  initiative: { kind: 'window', ms: DAY_MS },
  community: { signals: [], operations: [] },
};

/** Префикс handle подставного мессенджера: `m<N>`. */
export const HANDLE_PREFIX = 'm';
