import type { MessageKind, TextStyle } from './message.types';

/** Все виды сообщения. */
export const MESSAGE_KINDS = [
  'text',
  'image',
  'audio',
  'video',
  'document',
] as const satisfies readonly MessageKind[];

/** Стили в каноническом порядке: в нём стили лежат во фрагменте. */
export const TEXT_STYLES = [
  'bold',
  'italic',
  'strike',
  'code',
  'codeBlock',
  'quote',
] as const satisfies readonly TextStyle[];

/** Строчные стили: на строчный код и блок кода снаружи не действуют. */
export const INLINE_STYLES: readonly TextStyle[] = ['bold', 'italic', 'strike'];

/** Перевод строки, которым построитель ставит блок на целые строки. */
export const LINE_BREAK = '\n';
