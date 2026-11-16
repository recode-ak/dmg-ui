import type { toJsonSchema } from 'dmg-core';

/**
 * JSON Schema в нормализованной форме манифестов UI. Тип берётся из
 * `toJsonSchema` корня `dmg-core`: сам тип корень не экспортирует (Т-19).
 */
export type NormalizedSchema = ReturnType<typeof toJsonSchema>;
