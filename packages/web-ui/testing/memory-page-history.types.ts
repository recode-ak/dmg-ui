/**
 * Когда подставная история отдаёт переход по записи (D-UI-104): `immediate`
 * — внутри `back`/`forward`, `deferred` — по `release()`, как браузер, чей
 * `popstate` приходит позже «Назад».
 */
export type MemoryPageHistoryMode = 'immediate' | 'deferred';
